# -*- coding: utf-8 -*-
import datetime
import sys

def main():
    """
    Fonction principale qui affiche 'Hello World' accompagné de l'horodatage actuel.
    """
    try:
        # Récupération de l'heure locale
        now = datetime.datetime.now()
        
        # Formatage de la date : YYYY-MM-DD HH:MM:SS
        timestamp = now.strftime("%Y-%m-%d %H:%M:%S")
        
        # Affichage du message formatté
        print(f"Hello World ! Date et heure actuelles : {timestamp}")
        
    except Exception as e:
        print(f"Erreur lors de l'exécution : {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
