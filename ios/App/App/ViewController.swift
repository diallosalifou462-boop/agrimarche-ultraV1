import UIKit
import Capacitor

// ⚠️ FIX : le geste natif iOS "glisser depuis le bord gauche pour revenir
// en arrière" n'est PAS activé par défaut par Capacitor. Il faut l'activer
// explicitement sur la WKWebView sous-jacente via
// `allowsBackForwardNavigationGestures`. Comme le storyboard pointait
// directement sur `CAPBridgeViewController` (la classe par défaut du
// framework Capacitor, non modifiable depuis le storyboard), il n'y avait
// aucun endroit où faire ce réglage — d'où le swipe-back qui ne
// fonctionnait pas. On sous-classe donc `CAPBridgeViewController` ici pour
// pouvoir l'activer, et on met à jour Main.storyboard pour utiliser cette
// classe à la place.
//
// Ça fonctionne avec la navigation client-side de Next.js (App Router) car
// `router.push()` s'appuie sur l'API History du navigateur (`pushState`),
// que la WKWebView suit dans son propre historique de navigation — le
// geste de swipe déclenche donc un retour en arrière cohérent avec la pile
// de navigation de l'app.
class ViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        self.webView?.allowsBackForwardNavigationGestures = true
    }
}
