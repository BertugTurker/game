const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 960, height: 540 });
  
  try {
    await page.goto('http://localhost:8000', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Click the orange button to close dialog
    await page.mouse.click(480, 410);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Click to enter WC counter
    await page.mouse.click(850, 110);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.screenshot({ path: '/tmp/wc_counter.png' });
    console.log('Screenshot saved');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
