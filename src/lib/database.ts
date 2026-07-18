import { Capacitor } from "@capacitor/core";
import {
  SQLiteConnection,
  CapacitorSQLite,
} from "@capacitor-community/sqlite";

export const isNativeApp = () => {
  return Capacitor.isNativePlatform();
};

export const sqlite = new SQLiteConnection(CapacitorSQLite);

export async function createDatabase() {
  if (!isNativeApp()) return null;

  const db = await sqlite.createConnection(
    "agrimarche",
    false,
    "no-encryption",
    1,
    false
  );

  await db.open();

  // Création de la table des produits
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt INTEGER
    );
  `);

  return db;
}