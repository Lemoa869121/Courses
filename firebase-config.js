// Configuration Firebase du foyer.
// Ces valeurs ne sont pas secrètes : la sécurité est assurée par firestore.rules.
// Remplace les "A_REMPLIR" par le bloc firebaseConfig de ton projet Firebase.
export const firebaseConfig = {
  apiKey: "A_REMPLIR",
  authDomain: "A_REMPLIR",
  projectId: "A_REMPLIR",
  storageBucket: "A_REMPLIR",
  messagingSenderId: "A_REMPLIR",
  appId: "A_REMPLIR"
};

// Adresses Google autorisées (doit correspondre à firestore.rules).
export const allowedEmails = [
  "guiraud.familia@gmail.com"
];
