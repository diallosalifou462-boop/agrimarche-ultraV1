#ifndef FirebaseSafeConfigure_h
#define FirebaseSafeConfigure_h

#import <Foundation/Foundation.h>

/// Configure Firebase comme FirebaseApp.configure(), mais absorbe en toute
/// sécurité l'exception "Default app has already been configured."
///
/// Bug connu du SDK Firebase iOS (github.com/firebase/firebase-ios-sdk
/// issue #15788) : sur iOS 26+, [FIRApp defaultApp] peut renvoyer nil alors
/// que Firebase a DÉJÀ été configuré ailleurs (ex: par les plugins natifs
/// @capacitor-firebase/authentication et @capacitor-firebase/messaging, qui
/// s'auto-configurent chacun de leur côté et peuvent entrer en course au
/// démarrage). [FIRApp configure] lève alors une NSException — et Swift ne
/// peut PAS l'attraper avec try/catch (ce n'est pas une NSError), donc le
/// process se termine immédiatement. On l'intercepte ici côté Objective-C.
void SafeFirebaseConfigure(void);

#endif /* FirebaseSafeConfigure_h */
