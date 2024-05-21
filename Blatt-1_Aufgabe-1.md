# Blatt 1 - Aufgabe 1

## Was sind Sticky Sessions [1 - 3]
Sticky Session werden im Bereich des Loadbalancings eingesetzt. Der Loadbalancer verteilt Anfragen auf mehrere Server.
Mithilfe der Sticky Session werden Anfragen desselben Clients immer an denselben Server weitergeleitet.  
Bei traditionelle Webanwendungen die aus mehreren Seiten bestehen, verliert der Browser bei jedem Laden einer neuen Seite den Zustand.
Also muss dieser Serverseitig vorgehalten werden und wird für die Anreicherung der Webseiten verwendet.  

Gerade bei Anwendungen, die Serverseitig einen Session State haben, sind Sticky Sessions von Vorteil.  
Der Session State muss so nicht aufwendig zwischen Servern synchronisiert werden.  
Zudem können Caches effizienter genutzt werden. 

Ein Nachteil ist, dass die Lastverteilung nicht mehr so effizient arbeiten kann. Es könnte zu ungleichheiten in der Verteilung kommen.  
Ein weiterer Nachteil, gerade für sehr große Anbieter, ist, dass die Loadbalancer immer alle aktiven Sessions im Speicher halten müssen um einen hohen throughput gewährleisten zu können [4].

## SPAs [5]
Single Page Applications (SPAs) sind Webanwendungen, die nur eine einzige HTML-Seite laden. Alle weiteren Inhalte werden dynamisch mithilfe von JavaScript nachgeladen.
Dadurch kann der Zustand der Anwendung auf den Client ausgelagert werden, da sich das Browserfenster nie komplett neu lädt und den Zustand im JavaScript halten kann.  
Wird die SPA mit einer API verbunden, die sich an REST prinzipien hält, können Sticky Sessions komplett vermieden werden.  
Dies ermöglicht eine effizientere Lastverteilung und schnelleres Loadbalancing.  
Fällt ein Server aus, gehen keine Session States von Nutzern verloren.


## Quellen
- [1] https://www.linode.com/docs/guides/configuring-load-balancer-sticky-session/
- [2] https://traefik.io/glossary/what-are-sticky-sessions/
- [3] https://www.stackpath.com/edge-academy/load-balancing-on-layer-2-versus-layer-3/
- [4] R. Miao, H. Zeng, C. Kim, J. Lee, and M. Yu "SilkRoad: Making Stateful Layer-4 Load Balancing Fast and Cheap Using Switching ASICs"
- [5] https://developer.mozilla.org/en-US/docs/Glossary/SPA