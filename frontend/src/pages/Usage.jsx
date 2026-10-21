import { downloadUsageCsv, getUsage } from "../lib/api.js";
import PageFrame from "../components/layout/PageFrame.jsx";
import UsagePanel from "../components/usage/UsagePanel.jsx";

export default function Usage() {
  return (
    <div className="min-h-full">
      <PageFrame className="flex flex-col gap-5">
        <UsagePanel loadUsage={getUsage} exportUsage={downloadUsageCsv} />
      </PageFrame>
    </div>
  );
}
