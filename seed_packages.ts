import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./sa.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seedPackages() {
  const newPackages = [
    { name: 'Moisturizing Package', price: 45.000, sessions: 1, category: 'salon' },
    { name: 'Gaps Package', price: 45.000, sessions: 1, category: 'salon' }
  ];

  for (const pkg of newPackages) {
    const docRef = db.collection('packages').doc();
    await docRef.set({
      ...pkg,
      createdAt: new Date().toISOString()
    });
    console.log(`Added ${pkg.name}`);
  }
  
  console.log('Done!');
  process.exit(0);
}

seedPackages().catch(console.error);
