//
//  NotificationService.swift
//  À placer dans le target "Notification Service Extension" (voir étapes
//  d'installation dans le message). Ce fichier télécharge l'image jointe
//  au push (fcmOptions.imageUrl côté serveur) et l'attache à la notification
//  avant affichage — sans lui, iOS ignore silencieusement l'image.
//

import UserNotifications

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // FCM place l'URL de l'image ici pour les pushs "data-only enrichis" ;
        // selon la version du SDK FCM iOS, elle peut aussi arriver sous
        // "fcm_options.image" ou directement dans userInfo["image"].
        let userInfo = request.content.userInfo
        let imageUrlString =
            (userInfo["fcm_options"] as? [String: Any])?["image"] as? String
            ?? userInfo["image"] as? String
            ?? userInfo["imageUrl"] as? String

        guard
            let imageUrlString = imageUrlString,
            let imageUrl = URL(string: imageUrlString)
        else {
            contentHandler(bestAttemptContent)
            return
        }

        downloadImage(from: imageUrl) { attachment in
            if let attachment = attachment {
                bestAttemptContent.attachments = [attachment]
            }
            contentHandler(bestAttemptContent)
        }
    }

    // Appelé si le téléchargement prend trop de temps (~30s max côté iOS) :
    // on affiche quand même la notification, juste sans l'image.
    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { downloadedUrl, response, error in
            guard let downloadedUrl = downloadedUrl, error == nil else {
                completion(nil)
                return
            }

            let fileManager = FileManager.default
            let tmpDirectory = fileManager.temporaryDirectory
            let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let localUrl = tmpDirectory.appendingPathComponent(UUID().uuidString + "." + ext)

            do {
                try fileManager.moveItem(at: downloadedUrl, to: localUrl)
                let attachment = try UNNotificationAttachment(identifier: "image", url: localUrl, options: nil)
                completion(attachment)
            } catch {
                completion(nil)
            }
        }
        task.resume()
    }
}
