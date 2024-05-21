# Software Systeme

## Allgemein
Ein wahrscheinlich to be Zeichenprogramm in TypeScript.  
Als Dev Server wird Vite verwendet.  
> Vite ist ein ESM Dev Server und bundelt den Quelltext nicht, sondern stellt die nativen ESM Module dem Browser zur Verfügung. Der Plan ist im späteren Verlauf Hot Module Replacement zu testen und für die Entwicklung zu implementieren.   

Des Weiteren versuche ich die Aufgaben mit Web Components umzusetzen.  
Das ist mein erstes Projekt mit Vite und Web Components und generell ohne ein Framework.

## Starten
Entweder per Vite um auch Source Maps zu generieren
- `npm i`
- `npm run dev`

Alternativ kann `/dist` statisch geserved werden. Der Ordner enthält das production Bundle von Vite und kann ohne installation verwendet werden. Enthält aber keine Source Maps.  
Beispielsweise mithilfe von __http-server__
- `npx http-server ./dist`

# Aufbau
Die Hauptaufgaben werden an die vier Komponenten verteilt:
- DrawingCanvas
  - User Facing, Input, Context Menu
  - Shape Rendering
- ShapeManager (verschiedene Implementierungen für verschiedene Speicherarten)
  - Shape storage
  - Z-Index Management
- SelectionManager
  - Shape selection storage
  - Shape manipulation

# Blatt 2
## Meine Lösung für Z - Index
Beibehalten des Arrays.  
Wird die Z-Order geändert, werden die Elemente geshifted und wieder eingefügt.  
Mithilfe eines Index Lookup Caches, müssen die Shapes nicht in der Liste gesucht werden.  
**Ohne genauen Beweis sollte das für das reine Ändern der Reihenfolge eine Array größen unabhängige Laufzeit sein.** O(k) wobei k die Anzahl der Layer ist.

**Problem:** Ein Element an den Anfang zu fügen ist teuer. Je nach Implementierung der JS-Runtime. V8 verwendet wohl einen copy bei jedem unshift.  
Die Optimierung bringt nicht viel, da die meiste Zeit/Rechenleistung beim Rendern der Shapes verbraucht wird.


## Alternative überlegung - Linked List
Erste Idee war es eine Linked List zu verwenden, um einfach die Glieder einzufügen und von O(1) Laufzeit beim Einfügen zu profitieren.  
Shapes werden in der Anwendung so oder so meist iteriert, ein Zugriff von O(n) für das Suchen / direkte Aufrufen wäre also nicht so schlimm.

**Problem:** Implementierung umständlicher als Array Ansatz. Tauschen an sich sogar langsamer als mit Array, da Element erst gesucht werden muss, aber auch hier wäre ein Index Lookup Cache möglich.  
Bringt auch keine Vorteile, da die meiste Zeit/Rechenleistung beim Rendern der Shapes verbraucht wird.

##  Alternative überlegung - B-Tree
Verwendung eines Baums, erlaubt schnelles Einfügen und dadurch schnelles Ändern des Z-Index O(log n).  

**Vorteil:** Zu Knoten kann ein rendering Cache gespeichert werden. Idealerweise wird ein selbst balancierender Baum der mehrere Kinder pro Knoten erlaubt verwendet.
**Problem:** Aufwendige und komplexe Implementierung.


### Quellen
- https://www.bigocheatsheet.com/