(function () {
  const BACKUP_KIND = "pedido-em-dia-backup";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function filename() {
    const now = new Date();
    return `PedidoEmDia_Backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
  }

  async function exportBackup() {
    await AtelieDB.snapshot("Backup salvo pela usuária");
    const orders = await AtelieDB.getAll("orders");
    const clients = await AtelieDB.getAll("clients");
    const settings = await AtelieDB.getAll("settings");
    const snapshots = await AtelieDB.getAll("snapshots");
    const data = {
      kind: BACKUP_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { orders, clients, settings, snapshots }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    await AtelieDB.setSetting("lastBackupAt", new Date().toISOString());
    return data;
  }

  async function importBackup(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || parsed.kind !== BACKUP_KIND || !parsed.data) {
      throw new Error("Arquivo de backup inválido.");
    }
    await AtelieDB.snapshot("Antes de restaurar backup");
    await AtelieDB.clear("orders");
    await AtelieDB.clear("clients");
    await AtelieDB.clear("settings");
    for (const order of parsed.data.orders || []) await AtelieDB.put("orders", order);
    for (const client of parsed.data.clients || []) await AtelieDB.put("clients", client);
    for (const setting of parsed.data.settings || []) await AtelieDB.put("settings", setting);
    for (const snapshot of parsed.data.snapshots || []) await AtelieDB.put("snapshots", snapshot);
    const snapshots = (await AtelieDB.getAll("snapshots")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    await Promise.all(snapshots.slice(5).map((item) => AtelieDB.remove("snapshots", item.id)));
    await AtelieDB.setSetting("lastBackupAt", new Date().toISOString());
  }

  window.AtelieBackup = { exportBackup, importBackup };
})();
