"""
Script de test pour VibeCoder Orchestrator.
Affiche un message de bienvenue standard en Python.
"""

def main() -> None:
    """
    Fonction principale exécutant la logique d'affichage.
    """
    try:
        message = "Hello, World!"
        print(message)
    except Exception as e:
        print(f"Une erreur est survenue lors de l'exécution: {e}")

if __name__ == "__main__":
    main()
