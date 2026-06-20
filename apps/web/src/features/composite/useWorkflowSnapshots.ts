import { useEffect, useState } from "react";
import {
  loadWorkflowMedia,
  type PersistedWorkflowMedia,
} from "../../shared/lib/workflowMediaSettings";
import {
  loadWorkflowCompositeSettingsWithMigration,
  type WorkflowCompositeSettings,
} from "../../shared/lib/workflowCompositeCommand";

export function useWorkflowSnapshots(): {
  media: PersistedWorkflowMedia;
  composite: WorkflowCompositeSettings;
  refresh: () => void;
} {
  const [media, setMedia] = useState(() => loadWorkflowMedia());
  const [composite, setComposite] = useState(() => loadWorkflowCompositeSettingsWithMigration());

  const refresh = () => {
    setMedia(loadWorkflowMedia());
    setComposite(loadWorkflowCompositeSettingsWithMigration());
  };

  useEffect(() => {
    const onMedia = () => setMedia(loadWorkflowMedia());
    const onComposite = () => setComposite(loadWorkflowCompositeSettingsWithMigration());
    window.addEventListener("mbox:workflow-media", onMedia);
    window.addEventListener("mbox:workflow-composite", onComposite);
    return () => {
      window.removeEventListener("mbox:workflow-media", onMedia);
      window.removeEventListener("mbox:workflow-composite", onComposite);
    };
  }, []);

  return { media, composite, refresh };
}
