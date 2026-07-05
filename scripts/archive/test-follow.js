import { chromium } from 'playwright';

async function testFollow() {
  console.log('🚀 Testing Instagram follow with Playwright...');
  
  const browser = await chromium.launch({
    headless: false, // Mode visible pour voir ce qui se passe
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  try {
    // Aller sur Instagram
    console.log('📱 Going to Instagram...');
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    console.log('✅ Page loaded!');
    console.log('📍 Current URL:', page.url());
    
    // Récupérer le titre de la page
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    // Prendre un screenshot pour debug
    await page.screenshot({ path: 'instagram-login.png', fullPage: true });
    console.log('📸 Screenshot saved: instagram-login.png');

    // Chercher les inputs
    const usernameInput = await page.locator('input[name="username"]').count();
    console.log('🔍 Username inputs found:', usernameInput);

    // Attendre 30 secondes pour voir
    console.log('⏳ Waiting 30s - check the browser window...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'instagram-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testFollow();
