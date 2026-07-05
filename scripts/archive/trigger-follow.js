// Script pour déclencher le follow des agents A et B
const userId = 15; // ID de pako_mrtz

fetch(`http://localhost:5000/api/admin/trigger-follow/${userId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
})
.then(res => res.json())
.then(data => {
  console.log('✅ Follow triggered:', data);
})
.catch(err => {
  console.error('❌ Error:', err);
});
