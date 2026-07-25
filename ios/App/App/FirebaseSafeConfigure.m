#import "FirebaseSafeConfigure.h"
@import FirebaseCore;

void SafeFirebaseConfigure(void) {
    @try {
        if ([FIRApp defaultApp] == nil) {
            [FIRApp configure];
        }
    } @catch (NSException *exception) {
        // Voir FirebaseSafeConfigure.h : Firebase est déjà configuré dans ce
        // cas précis (c'est justement pour ça que l'exception est levée),
        // donc on peut ignorer et continuer normalement.
        NSLog(@"[SafeFirebaseConfigure] Exception ignorée (Firebase déjà configuré ailleurs) : %@", exception.reason);
    }
}
