import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Copy, Lock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

declare const chrome: any;

export default function ExtensionAuth() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;

    const sendToExtension = async () => {
      try {
        // Générer un token temporaire via l'API
        console.log('🔑 Generating temporary token...');
        const response = await fetch('/api/extension/generate-token', {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          console.error('❌ Failed to generate token:', response.statusText);
          return;
        }

        const { token, userId } = await response.json();
        console.log('✅ Token generated:', { userId });

        // Envoyer le token à l'extension via chrome.runtime
        const extensionId = 'dbogablehjicifjkkgigabhdofbjjbmj'; // ID réel de l'item Chrome Web Store (= dérivé du "key" du manifest)
        
        console.log('🔐 Sending token to extension...');
        
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage(
            extensionId,
            {
              type: 'WALER_AUTH',
              userId,
              token,
            },
            (response: any) => {
              if (chrome.runtime.lastError) {
                console.error('❌ Error:', chrome.runtime.lastError.message);
              } else {
                console.log('✅ Auth sent successfully:', response);
              }
            }
          );
        } else {
          console.error('❌ Chrome extension API not available');
        }
      } catch (error) {
        console.error('❌ Error:', error);
      }
    };

    // Attendre un peu que l'extension soit prête
    setTimeout(sendToExtension, 1000);
  }, [user]);

  const copyUserId = () => {
    if (user) {
      navigator.clipboard.writeText(user.id.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };


  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#111111] p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-green-500" />
              {t.extensionAuth.authRequired}
            </CardTitle>
            <CardDescription>
              {t.extensionAuth.authRequiredDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/'} className="w-full">
              {t.extensionAuth.signIn}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#111111] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-500" />
            {t.extensionAuth.authenticatedTitle}
          </CardTitle>
          <CardDescription>
            {t.extensionAuth.authenticatedDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {t.extensionAuth.autoAuthTitle}
            </p>
            <p className="text-xs text-green-500/80">
              {t.extensionAuth.autoAuthDesc}
            </p>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">{t.extensionAuth.yourUserId}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm">
                {user.id}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={copyUserId}
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">{t.extensionAuth.nextSteps}</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              {t.extensionAuth.steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>

          <Button
            onClick={() => window.close()}
            className="w-full"
          >
            {t.extensionAuth.closeButton}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
