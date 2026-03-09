/**
 * @file hello.js
 * @description Script de test standard "Hello World" pour validation du pipeline VibeCoder.
 * @version 1.0.0
 * @license MIT
 */

/**
 * Affiche le message de bienvenue dans la console.
 * @returns {void}
 */
const main = () => {
  try {
    console.log("Hello World");
  } catch (error) {
    console.error("Erreur lors de l'exécution du Hello World :", error.message);
    process.exit(1);
  }
};

// Exécution du point d'entrée
main();
