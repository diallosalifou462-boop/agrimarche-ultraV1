import { Capacitor } from "@capacitor/core";
import { SQLiteConnection } from "@capacitor-community/sqlite";
export const isNativeApp = () => {
  return Capacitor.isNativePlatform();
};