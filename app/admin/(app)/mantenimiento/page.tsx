import { MaintenancePanel } from "@/components/admin/MaintenancePanel";
import { getMaintenanceOverview } from "@/lib/data/admin";

export default async function MantenimientoPage() {
  const overview = await getMaintenanceOverview();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading m-0 text-xl font-bold">Mantenimiento</h1>
        <span className="text-ink-soft text-sm">
          Limpieza de comprobantes y emails pendientes
        </span>
      </div>
      <MaintenancePanel overview={overview} />
    </div>
  );
}
