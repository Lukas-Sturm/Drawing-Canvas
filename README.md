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

# Blatt 3
## Event Sourcing
- Shapes sind nun einfache reine Objekte
  - Ermöglicht einfaches Serialisieren und Deserialisieren


- Jede Komponente speichert selbst die Shapes
  - `ShapeStore` erleichtert das Speichern und Verwalten der Shapes
  - Canvas besitzt spezielle Shapes die Rendering Informationen enthalten
  - SelectionTool könnte auch eigene Shapes bekommen (aus Zeitgründen verwendet is jedoch die CanvasShapes)


- Alle Events und Handler sind strict typed
  - Das hat einiges an Zeit gekostet schöne Typen zu bauen, aber wenn es dann funktioniert macht es wirklich Spaß :)
  - Manche Typen funktionieren noch nicht so wie ich mir das vorstelle, aber das ist ein Lernprozess
  
- Aus Gründen der Separation of Concerns kann der Canvas nun selbst entscheiden, wann er ein redraw durchführt 
  - Dafür wird der RequestAnimationFrame Mechanismus verwendet, wenn sich etwas an den Shapes ändert, dadurch werden je nach Refreshrate des Browsers mehrere Events gebündelt. Hier ist mir die simplizität wichtiger als die Performance.


- Die Events besitzen ein `origin` Feld
  - Mit diesem kann die Komponente entscheiden, ob sie auf ein Event Reagieren muss.
  - So ist es möglich die Events verschiedener Clients zu synchronisieren
  - Oder beispielsweise mehrere `SelectionTools` zu verwenden, die sich automatisch synchronisieren


- Änderungen an den Shapes und auch Bewegung wird durch das `ShapeChanged` Event abgebildet
  - Das ermöglicht es einfacher Snapshots zu erstellen, es muss nur das letzte ShapeChanged Event gespeichert werden
    - Für Shanpshots muss noch eine Lösung für das Z-Indexing gefunden werden.
    - Gelöschte Elemente aus dem Snapshot zu entfernen würde Z-Change Events durcheinander bringen
  - Zudem gibt es für alle Zustandsänderungen nur ein Event


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