// Using Chrome API
import { accountGet, accountSet } from './account-storage.js';
import { API_URL } from '../config.js';

interface TrackedData {
  type: 'follower' | 'unfollower' | 'ghost' | 'engagement';
  username: string;
  avatarUrl?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class SyncManager {
  private readonly API_URL = API_URL;
  private syncQueue: TrackedData[] = [];
  private isSyncing = false;

  async trackFollower(data: any) {
    await this.addToQueue({
      type: 'follower',
      username: data.username,
      avatarUrl: data.avatarUrl,
      timestamp: Date.now(),
      metadata: data.metadata,
    });
    
    // Incrémenter les stats de session
    await this.incrementStat('follower');
    
    // Synchroniser immédiatement les nouveaux followers
    console.log('🚀 New follower detected, syncing immediately...');
    await this.syncToServer();
  }

  async trackUnfollower(data: any) {
    await this.addToQueue({
      type: 'unfollower',
      username: data.username,
      avatarUrl: data.avatarUrl,
      timestamp: Date.now(),
      metadata: data.metadata,
    });
    
    // Incrémenter les stats de session
    await this.incrementStat('unfollower');
    
    // Synchroniser immédiatement les unfollowers
    console.log('🚀 Unfollower detected, syncing immediately...');
    await this.syncToServer();
  }

  async trackGhost(data: any) {
    await this.addToQueue({
      type: 'ghost',
      username: data.username,
      avatarUrl: data.avatarUrl,
      timestamp: Date.now(),
      metadata: data.metadata,
    });

    await this.incrementStat('ghost');
  }

  async trackEngagement(data: any) {
    await this.addToQueue({
      type: 'engagement',
      username: data.username,
      timestamp: Date.now(),
      metadata: {
        action: data.action,
        postId: data.postId,
        duration: data.duration,
      },
    });
    
    // Incrémenter les stats de session
    await this.incrementStat('engagement');
  }

  private async addToQueue(data: TrackedData) {
    const stored = await accountGet('syncQueue');
    const queue: TrackedData[] = (stored.syncQueue as TrackedData[]) || [];
    queue.push(data);

    await accountSet({ syncQueue: queue });
    this.syncQueue = queue;

    if (queue.length >= 10) {
      await this.syncToServer();
    }
  }

  async syncToServer() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress');
      return;
    }

    const stored = await accountGet(['syncQueue', 'userId', 'apiToken', 'isAuthenticated', 'userInfo', 'subscriptionActive']);

    if (!stored.isAuthenticated || !stored.userId) {
      console.log('❌ Not authenticated, skipping sync');
      return;
    }

    if (stored.subscriptionActive === false) {
      console.log('🚫 Subscription inactive, skipping sync');
      return;
    }

    const queue: TrackedData[] = (stored.syncQueue as TrackedData[]) || [];
    if (queue.length === 0) {
      console.log('✅ Nothing to sync');
      return;
    }

    this.isSyncing = true;

    try {
      console.log(`📤 Syncing ${queue.length} items...`);

      const response = await fetch(`${this.API_URL}/extension/sync`, {
        method: 'POST',
        credentials: 'include', // requireAuth = cookie de session du dashboard
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.apiToken}`,
        },
        body: JSON.stringify({
          userId: stored.userId,
          data: queue,
        }),
      });

      if (response.ok) {
        await accountSet({
          syncQueue: [],
          lastSync: Date.now(),
        });
        this.syncQueue = [];
        console.log('✅ Sync successful');

        // Mettre à jour le nombre de followers si disponible
        if (stored.userInfo) {
          console.log('📊 Updating user info after sync...');
          await this.updateUserInfo(stored.userInfo, stored.userId, stored.apiToken);
        }

        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Waler',
          message: `${queue.length} events synced`,
        });
      } else {
        console.error('❌ Sync failed:', response.status);
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  async updateUserInfo(userInfo: any, userId: string, token: string) {
    try {
      const response = await fetch(`${this.API_URL}/extension/update-user-info`, {
        method: 'POST',
        credentials: 'include', // requireAuth = cookie de session du dashboard
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          followersCount: userInfo.followersCount || 0,
          followingCount: userInfo.followingCount || 0,
          postsCount: userInfo.postsCount || 0,
          bio: userInfo.bio || '',
          isPrivate: userInfo.isPrivate || false,
        }),
      });

      if (response.ok) {
        console.log('✅ User info updated successfully');
      } else {
        console.error('❌ Failed to update user info:', response.status);
      }
    } catch (error) {
      console.error('❌ Error updating user info:', error);
    }
  }

  async getLocalStats() {
    const stored = await accountGet('sessionStats');
    const sessionStats = stored.sessionStats || {
      followers: 0,
      unfollowers: 0,
      ghost: 0,
      pendingClassification: 0,
      engagements: 0,
    };

    return {
      followers: sessionStats.followers,
      unfollowers: sessionStats.unfollowers,
      ghost: sessionStats.ghost,
      pendingClassification: sessionStats.pendingClassification,
      engagements: sessionStats.engagements,
    };
  }

  async incrementStat(type: 'follower' | 'unfollower' | 'ghost' | 'engagement') {
    const stored = await accountGet('sessionStats');
    const sessionStats = stored.sessionStats || {
      followers: 0,
      unfollowers: 0,
      ghost: 0,
      pendingClassification: 0,
      engagements: 0,
    };

    if (type === 'follower') {
      // Un nouveau follower entre en file d'attente de classement (PENDING).
      sessionStats.followers++;
      sessionStats.pendingClassification = (sessionStats.pendingClassification || 0) + 1;
    } else if (type === 'unfollower') {
      // La personne quitte PENDING pour la section Unfollowers.
      sessionStats.unfollowers++;
      sessionStats.pendingClassification = Math.max(0, (sessionStats.pendingClassification || 0) - 1);
    } else if (type === 'ghost') {
      // La personne quitte PENDING pour la section Ghost.
      sessionStats.ghost = (sessionStats.ghost || 0) + 1;
      sessionStats.pendingClassification = Math.max(0, (sessionStats.pendingClassification || 0) - 1);
    } else if (type === 'engagement') sessionStats.engagements++;

    await accountSet({ sessionStats });
  }

  async classifyPerson() {
    const stored = await accountGet('sessionStats');
    const sessionStats = stored.sessionStats || { pendingClassification: 0 };
    sessionStats.pendingClassification = Math.max(0, (sessionStats.pendingClassification || 0) - 1);
    await accountSet({ sessionStats });
  }

  async resetStats() {
    await accountSet({
      sessionStats: {
        followers: 0,
        unfollowers: 0,
        ghost: 0,
        pendingClassification: 0,
        engagements: 0,
      }
    });
  }

  async syncFullDatabase() {
    try {
      console.log('🔄 Starting full database sync...');

      const stored = await accountGet(['followerDatabase', 'userId', 'apiToken', 'isAuthenticated', 'subscriptionActive']);

      if (!stored.isAuthenticated || !stored.userId) {
        console.log('❌ Not authenticated, cannot sync');
        return { success: false, error: 'Not authenticated' };
      }

      if (stored.subscriptionActive === false) {
        console.log('🚫 Subscription inactive, cannot sync');
        return { success: false, error: 'Subscription inactive' };
      }

      const db = stored.followerDatabase;
      if (!db || !db.followers) {
        console.log('❌ No follower database found');
        return { success: false, error: 'No database' };
      }

      // Cibler EXPLICITEMENT le compte Instagram actif (son accountId backend)
      // pour ne PAS écrire les followers sur un autre compte si la session backend
      // (session.activeAccountId) n'est pas alignée sur le compte sélectionné dans
      // l'extension. Le serveur valide l'appartenance de cet accountId à l'owner.
      const activeStore = await chrome.storage.local.get('activeDsUserId');
      const reg = await accountGet('accountRegistry');
      const activeEntry = reg.accountRegistry?.accounts?.[activeStore.activeDsUserId];
      const activeAccountId = activeEntry?.accountId;

      const followers = Object.entries(db.followers).map(([username, data]: [string, any]) => ({
        type: 'follower',
        username,
        avatarUrl: data.avatarUrl,
        timestamp: new Date(data.addedAt).getTime(),
        metadata: {
          position: data.position,
          isInitialScan: true
        }
      }));

      console.log(`📤 Syncing ${followers.length} followers from local database...`);

      const response = await fetch(`${this.API_URL}/extension/sync-full`, {
        method: 'POST',
        credentials: 'include', // requireAuth = cookie de session du dashboard
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stored.apiToken}`,
        },
        body: JSON.stringify({
          userId: stored.userId,
          accountId: activeAccountId,
          followers: followers,
          totalCount: db.totalCount,
          lastScanDate: db.lastScanDate,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Full database sync successful:', result);
        
        await accountSet({
          lastFullSync: Date.now(),
        });

        return { success: true, synced: followers.length };
      } else {
        const error = await response.text();
        console.error('❌ Full sync failed:', response.status, error);
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (error: any) {
      console.error('❌ Full sync error:', error);
      return { success: false, error: error.message };
    }
  }
}


