const { themes } = require('../themes');
const chromium = require('chrome-aws-lambda');
const { performance } = require('perf_hooks');
const { languages } = require('../languages');

const DEFAULTS = {
    VIEWPORT: {
        WIDTH: 1000,
        HEIGHT: 1000,
        DEVICE_SCALE_FACTOR: 2,
    },
    INDEX_PAGE: 'preview.html',
};

const chromiumLaunchOptions = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
];

function toSeconds(ms) {
    const x = ms/1000;
    return x.toFixed(2);
}

function sendErrorResponse(response, responseObject) {
    response.status(400);
    response.json(responseObject);
}

module.exports = async (request, response) => {
    try {
        const hostname =  process.env.NODE_ENV === 'production' ? "https://code2img.vercel.app" : "http://localhost:3000";
        const tStart = performance.now();
        console.log('');
        console.log('🎉 ', request.url);
        console.log('🛠 ', `Environment: ${process.env.NODE_ENV}`);
        console.log('🛠 ', `Rendering Method: Puppeteer, Chromium headless`);
        console.log('🛠 ', `Hostname: ${hostname}`);
        
        const theme = request.query['theme'];
        const language = request.query['language'];
        const lineNumbers = request.query['line-numbers'];
        
        let width = DEFAULTS.VIEWPORT.WIDTH;
        let scaleFactor = DEFAULTS.VIEWPORT.DEVICE_SCALE_FACTOR;
        
        if (typeof request.body != 'string') {
            console.log('❌ ', 'Code snippet missing');
            sendErrorResponse(response, {
                message: 'Code snippet missing, please include it in the request body',
            });
            return;
        }
        
        if (!language || languages.indexOf(language) === -1) {
            console.log('❌ ', !language ? 'Language not specified' : `Unknown language '${language}'`);
            sendErrorResponse(response, {
                message: !language ? 'language missing: please specify a language' : `Unknown language '${language}'`,
                availableLanguages: languages,
            });
            return;
        }
        
        if (themes.indexOf(theme) === -1) {
            console.log('❌ ', `Unknown theme '${theme}'`);
            sendErrorResponse(response, {
                message: `Unknown theme: '${theme}'`,
                availableThemes: themes,
            });
            return;
        }
        
        try {
            scaleFactor = parseInt(request.query['scale']) || DEFAULTS.VIEWPORT.DEVICE_SCALE_FACTOR;
            scaleFactor = Math.min(Math.max(1, scaleFactor), 5); // Make sure number is in range between 1-5
        } catch (e) {
            scaleFactor = DEFAULTS.VIEWPORT.DEVICE_SCALE_FACTOR;
        }
        
        console.log('🛠 ', `Theme: ${theme}`);
        console.log('🛠 ', `Language: ${language}`);
        console.log('🛠 ', `Line Numbers: ${lineNumbers}`);
        console.log('🛠 ', `Scale Factor: ${scaleFactor}`);
        console.log('🛠 ', `width: ${width}`);
        
        try {
            width = Math.min(Math.abs(parseInt(request.query['width'])), 1920);
        } catch (exception) {
            console.warn('Invalid width', exception);
            width = DEFAULTS.VIEWPORT.WIDTH;
        }
        
        let queryParams = new URLSearchParams();
        theme && queryParams.set('theme', theme);
        language && queryParams.set('language', language);
        queryParams.set('line-numbers', lineNumbers === 'true' ? lineNumbers : 'false');
        queryParams.set('code', request.body);
        
        const queryParamsString = queryParams.toString();
        const pageUrl = `${hostname}/preview.html?${queryParamsString}`;
        
        const fontUrl = `${hostname}/fonts/NotoColorEmoji.ttf`;
        console.log('🛠 ', `Loading ${fontUrl}`);
        await chromium.font(fontUrl);

        console.log('🛠 ', 'Preview Page URL', pageUrl);
        let browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setViewport({ 
            deviceScaleFactor: scaleFactor, 
            width: width || DEFAULTS.VIEWPORT.WIDTH, 
            height: DEFAULTS.VIEWPORT.HEIGHT, 
            isMobile: false 
        });
        await page.goto(pageUrl);
        await page.waitForFunction('window.LOAD_COMPLETE === true');
        
        const codeView = await page.$('#container');
        var image = await codeView.screenshot();
        
        console.log('⏰ ', `Operation finished in ${ toSeconds(performance.now() - tStart)} seconds`);
        
        response.status(200);
        response.setHeader('Content-Type', 'image/png');
        response.send(image);
        
        await page.close();
        await browser.close();
    } catch (e) {
        console.error('❌ ', 'Uncaught Exception',e);
    }
}