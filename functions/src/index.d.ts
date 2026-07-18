import * as functions from 'firebase-functions/v2';
export declare const processSmsQueue: functions.CloudFunction<functions.firestore.FirestoreEvent<functions.firestore.QueryDocumentSnapshot | undefined, {
    docId: string;
}>>;
export declare const processEmailQueue: functions.CloudFunction<functions.firestore.FirestoreEvent<functions.firestore.QueryDocumentSnapshot | undefined, {
    docId: string;
}>>;
//# sourceMappingURL=index.d.ts.map