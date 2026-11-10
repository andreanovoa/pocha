/* Pocha — configuración de Firebase / Firebase configuration.
 *
 * Pega aquí el objeto firebaseConfig de la consola de Firebase
 * (Configuración del proyecto → Tus apps → App web). Estos valores son
 * públicos: quien protege los datos son las reglas de Firestore.
 * Mientras apiKey esté vacío, el marcador funciona sin cuentas.
 *
 * Paste the firebaseConfig object from the Firebase console here
 * (Project settings → Your apps → Web app). These values are public:
 * the Firestore rules are what protect the data. While apiKey is empty,
 * the scoreboard works without accounts.
 */
window.POCHA_FIREBASE = {
  apiKey: 'AIzaSyC4u2LeLoNJG4-VBKYdeNphyF8eIR-r2cE',
  // el inicio de sesión vuelve a este dominio: la web andreanovoa.github.io sirve /__/auth/
  // sign-in comes back to this domain: the andreanovoa.github.io site serves /__/auth/
  authDomain: 'andreanovoa.github.io',
  projectId: 'pocha-37f93',
  storageBucket: 'pocha-37f93.firebasestorage.app',
  messagingSenderId: '687494503690',
  appId: '1:687494503690:web:17591a237cc097b68c6ef3'
};
