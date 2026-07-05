import { chromium } from 'playwright';

async function openWalerInstagram() {
  console.log('🚀 Opening Instagram login page for waler.web...');
  
  const browser = await chromium.launch({
    headless: false, // Mode visible pour que tu puisses interagir
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Aller sur Instagram
    console.log('📱 Navigating to Instagram...');
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Attendre un peu pour que la page charge
    await page.waitForTimeout(3000);

    // Attendre que le formulaire de login soit visible
    await page.waitForSelector('input[name="username"]', { timeout: 30000 });

    // Remplir le username
    console.log('✍️ Filling username...');
    await page.fill('input[name="username"]', 'waler.web');
    
    // Remplir le password
    console.log('✍️ Filling password...');
    await page.fill('input[name="password"]', 'Instawebsite1er2026');

    console.log('✅ Credentials filled!');
    console.log('👉 Click "Log in" button to continue');
    console.log('👉 Complete any verification if needed');
    console.log('👉 The browser will stay open for you to interact');
    
    // Ne pas fermer le navigateur - laisser l'utilisateur interagir
    console.log('\n⏳ Browser will stay open. Press Ctrl+C when done.');
    
    // Attendre indéfiniment - le navigateur reste ouvert
    await new Promise(() => {}); // Promise qui ne se résout jamais

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await browser.close();
  }
}

openWalerInstagram().catch(console.error);
