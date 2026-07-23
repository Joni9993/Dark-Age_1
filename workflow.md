Dark-Age_1 (dieser Ordner) → bleibt auf main, für Live-Hotfixes

Dark-Age_1-underworld → neuer Ordner, hier kannst du frei an den neuen Features basteln

Öffne den neuen Ordner z. B. in einem separaten VSCode-Fenster, dann kannst du in beiden parallel arbeiten.

Wenn du später Main-Änderungen (Hotfixes) in den Feature-Branch übernehmen willst: im -underworld-Ordner git fetch origin && git rebase origin/main (oder merge).
