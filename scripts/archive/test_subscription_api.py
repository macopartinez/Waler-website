import requests
import json

# Test the subscription API
BASE_URL = "http://localhost:5001"

print("🧪 Testing Waler Subscription API\n")

# Test 1: Health check
print("1️⃣ Testing health endpoint...")
try:
    response = requests.get(f"{BASE_URL}/api/health")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")
    print("   ✅ Health check passed\n")
except Exception as e:
    print(f"   ❌ Health check failed: {e}")
    print("   💡 Make sure the server is running: cd server && python app.py\n")
    exit(1)

# Test 2: Login with premium user
print("2️⃣ Testing login with premium user...")
session = requests.Session()
try:
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "premium@waler.com",
            "password": "premium123"
        }
    )
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        user = response.json()
        print(f"   User: {user.get('username')} ({user.get('email')})")
        print(f"   Tier: {user.get('subscription_tier')}")
        print("   ✅ Login successful\n")
    else:
        print(f"   ❌ Login failed: {response.json()}")
        print("   💡 Make sure the premium user exists (run quick_premium.py)\n")
        exit(1)
except Exception as e:
    print(f"   ❌ Login failed: {e}\n")
    exit(1)

# Test 3: Get subscription status
print("3️⃣ Testing subscription status endpoint...")
try:
    response = session.get(f"{BASE_URL}/api/subscription/status")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Response: {json.dumps(data, indent=2)}")
        print(f"   Tier: {data.get('tier')}")
        print(f"   Status: {data.get('status')}")
        print("   ✅ Subscription status retrieved\n")
    else:
        print(f"   ❌ Failed: {response.json()}\n")
except Exception as e:
    print(f"   ❌ Failed: {e}\n")

# Test 4: Get current user
print("4️⃣ Testing /api/auth/me endpoint...")
try:
    response = session.get(f"{BASE_URL}/api/auth/me")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        user = response.json()
        print(f"   User: {user.get('username')}")
        print(f"   Email: {user.get('email')}")
        print(f"   Tier: {user.get('subscription_tier')}")
        print(f"   Status: {user.get('subscription_status')}")
        print("   ✅ User info retrieved\n")
    else:
        print(f"   ❌ Failed: {response.json()}\n")
except Exception as e:
    print(f"   ❌ Failed: {e}\n")

print("=" * 50)
print("🎯 Summary:")
print("   If all tests passed, your premium subscription is working!")
print("   You can now login to the app with:")
print("   Email: premium@waler.com")
print("   Password: premium123")
print("=" * 50)
