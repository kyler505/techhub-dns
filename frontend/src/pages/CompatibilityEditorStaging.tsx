import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  COMPATIBILITY_DETAIL_FIELDS,
  COMPATIBILITY_DETAIL_STATUS_OPTIONS,
  COMPATIBILITY_STATUS_OPTIONS,
  type CompatibilityCellData,
  type CompatibilityComputer,
  type CompatibilityDetailField,
  type CompatibilityDetailStatus,
  type CompatibilityDock,
  type CompatibilityEditorStagingPayload,
  type CompatibilityStatus,
  compatibilityEditorStagingApi,
} from "../api/compatibilityEditorStaging";
import { extractApiErrorMessage } from "../utils/apiErrors";

type EditingCell = {
  computerKey: string;
  dockKey: string;
};

type CellEditorState = {
  status: CompatibilityStatus;
  notes: string;
  rebootNeeded: boolean;
  detailByField: Record<CompatibilityDetailField, CompatibilityDetailStatus | "">;
};

const DEFAULT_STATUS: CompatibilityStatus = "Compatible";

const STATUS_STYLE: Record<CompatibilityStatus, string> = {
  Compatible: "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200",
  Incompatible: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200",
  "Partially Compatible": "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200",
};

const DETAIL_FIELD_LABELS: Record<CompatibilityDetailField, string> = {
  display: "Display",
  charging: "Charging",
  usbDetection: "USB Detection",
  ethernet: "Ethernet",
  audio: "Audio",
  sdCard: "SD Card",
};

function sortMapKeysByName<T extends { name?: string }>(record: Record<string, T>) {
  return Object.keys(record).sort((left, right) => {
    const leftName = record[left]?.name ?? left;
    const rightName = record[right]?.name ?? right;
    return leftName.localeCompare(rightName, undefined, { sensitivity: "base" });
  });
}

function normalizePayload(payload: CompatibilityEditorStagingPayload): CompatibilityEditorStagingPayload {
  const normalizedDocks: Record<string, CompatibilityDock> = {};
  const rawDocks = payload.docks ?? {};
  for (const dockKey of Object.keys(rawDocks)) {
    const dock = rawDocks[dockKey];
    normalizedDocks[dockKey] = {
      ...dock,
      name: (dock?.name ?? dockKey).trim(),
      url: typeof dock?.url === "string" ? dock.url.trim() : "",
    };
  }

  const normalizedComputers: Record<string, CompatibilityComputer> = {};
  const rawComputers = payload.computers ?? {};
  for (const computerKey of Object.keys(rawComputers)) {
    const computer = rawComputers[computerKey] ?? { name: computerKey };
    const compatibilityData = { ...(computer.compatibilityData ?? {}) };
    const compatibilityNotes = { ...(computer.compatibilityNotes ?? {}) };
    normalizedComputers[computerKey] = {
      ...computer,
      name: (computer.name ?? computerKey).trim(),
      url: typeof computer.url === "string" ? computer.url.trim() : "",
      compatibilityData,
      compatibilityNotes,
      incompatibleWith: Array.isArray(computer.incompatibleWith) ? [...computer.incompatibleWith] : [],
      partiallyCompatibleWith: Array.isArray(computer.partiallyCompatibleWith) ? [...computer.partiallyCompatibleWith] : [],
    };
  }

  return {
    ...payload,
    docks: normalizedDocks,
    computers: normalizedComputers,
  };
}

function cellStatus(computer: CompatibilityComputer, dockKey: string): CompatibilityStatus {
  const entryStatus = computer.compatibilityData?.[dockKey]?.compatibilityStatus;
  if (entryStatus && COMPATIBILITY_STATUS_OPTIONS.includes(entryStatus)) {
    return entryStatus;
  }
  if (computer.incompatibleWith?.includes(dockKey)) {
    return "Incompatible";
  }
  if (computer.partiallyCompatibleWith?.includes(dockKey)) {
    return "Partially Compatible";
  }
  return DEFAULT_STATUS;
}

function cellHasNotes(computer: CompatibilityComputer, dockKey: string): boolean {
  const fromNotesMap = computer.compatibilityNotes?.[dockKey];
  const fromEntry = computer.compatibilityData?.[dockKey]?.notes;
  return Boolean((fromNotesMap && fromNotesMap.trim()) || (fromEntry && fromEntry.trim()));
}

function createCellEditorState(computer: CompatibilityComputer, dockKey: string): CellEditorState {
  const entry = computer.compatibilityData?.[dockKey] ?? {};
  const detailByField = COMPATIBILITY_DETAIL_FIELDS.reduce((acc, field) => {
    const value = entry[field];
    acc[field] = typeof value === "string" && COMPATIBILITY_DETAIL_STATUS_OPTIONS.includes(value as CompatibilityDetailStatus)
      ? (value as CompatibilityDetailStatus)
      : "";
    return acc;
  }, {} as Record<CompatibilityDetailField, CompatibilityDetailStatus | "">);

  return {
    status: cellStatus(computer, dockKey),
    notes: String(entry.notes ?? computer.compatibilityNotes?.[dockKey] ?? ""),
    rebootNeeded: Boolean(entry.rebootNeeded),
    detailByField,
  };
}

export default function CompatibilityEditorStaging() {
  const { isAdmin, user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<CompatibilityEditorStagingPayload | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [cellEditorState, setCellEditorState] = useState<CellEditorState | null>(null);

  const [addComputerOpen, setAddComputerOpen] = useState(false);
  const [addDockOpen, setAddDockOpen] = useState(false);
  const [newComputerKey, setNewComputerKey] = useState("");
  const [newComputerName, setNewComputerName] = useState("");
  const [newComputerUrl, setNewComputerUrl] = useState("");
  const [newDockKey, setNewDockKey] = useState("");
  const [newDockName, setNewDockName] = useState("");
  const [newDockUrl, setNewDockUrl] = useState("");

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const result = normalizePayload(await compatibilityEditorStagingApi.getData());
        setPayload(result);
        setInitialSnapshot(JSON.stringify(result));
      } catch (error: any) {
        const message = extractApiErrorMessage(error, "Failed to load compatibility editor data.");
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [authLoading, isAdmin]);

  const isDirty = useMemo(() => {
    if (!payload) {
      return false;
    }
    return JSON.stringify(payload) !== initialSnapshot;
  }, [payload, initialSnapshot]);

  const sortedDockKeys = useMemo(() => {
    if (!payload) {
      return [];
    }
    return sortMapKeysByName(payload.docks);
  }, [payload]);

  const sortedComputerKeys = useMemo(() => {
    if (!payload) {
      return [];
    }
    return sortMapKeysByName(payload.computers);
  }, [payload]);

  const updatePayload = (updater: (current: CompatibilityEditorStagingPayload) => CompatibilityEditorStagingPayload) => {
    setPayload((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  };

  const openCellEditor = (computerKey: string, dockKey: string) => {
    if (!payload) {
      return;
    }
    const computer = payload.computers[computerKey];
    if (!computer) {
      return;
    }
    setEditingCell({ computerKey, dockKey });
    setCellEditorState(createCellEditorState(computer, dockKey));
  };

  const closeCellEditor = () => {
    setEditingCell(null);
    setCellEditorState(null);
  };

  const saveCellEditor = () => {
    if (!editingCell || !cellEditorState) {
      return;
    }
    const { computerKey, dockKey } = editingCell;

    updatePayload((current) => {
      const computer = current.computers[computerKey];
      if (!computer) {
        return current;
      }

      const nextComputer: CompatibilityComputer = {
        ...computer,
        compatibilityData: { ...(computer.compatibilityData ?? {}) },
        compatibilityNotes: { ...(computer.compatibilityNotes ?? {}) },
        incompatibleWith: [...(computer.incompatibleWith ?? [])],
        partiallyCompatibleWith: [...(computer.partiallyCompatibleWith ?? [])],
      };

      const entry: CompatibilityCellData = {
        ...(nextComputer.compatibilityData?.[dockKey] ?? {}),
        compatibilityStatus: cellEditorState.status,
        studentEdited: true,
        rebootNeeded: cellEditorState.rebootNeeded,
      };

      const notes = cellEditorState.notes.trim();
      if (notes) {
        entry.notes = notes;
        nextComputer.compatibilityNotes![dockKey] = notes;
      } else {
        delete entry.notes;
        delete nextComputer.compatibilityNotes![dockKey];
      }

      for (const field of COMPATIBILITY_DETAIL_FIELDS) {
        const value = cellEditorState.detailByField[field];
        if (value) {
          entry[field] = value;
        } else {
          delete entry[field];
        }
      }

      if (entry.compatibilityStatus === "Incompatible") {
        if (!nextComputer.incompatibleWith!.includes(dockKey)) {
          nextComputer.incompatibleWith!.push(dockKey);
        }
        nextComputer.partiallyCompatibleWith = nextComputer.partiallyCompatibleWith!.filter((item) => item !== dockKey);
      } else if (entry.compatibilityStatus === "Partially Compatible") {
        if (!nextComputer.partiallyCompatibleWith!.includes(dockKey)) {
          nextComputer.partiallyCompatibleWith!.push(dockKey);
        }
        nextComputer.incompatibleWith = nextComputer.incompatibleWith!.filter((item) => item !== dockKey);
      } else {
        nextComputer.incompatibleWith = nextComputer.incompatibleWith!.filter((item) => item !== dockKey);
        nextComputer.partiallyCompatibleWith = nextComputer.partiallyCompatibleWith!.filter((item) => item !== dockKey);
      }

      nextComputer.compatibilityData![dockKey] = entry;

      return {
        ...current,
        computers: {
          ...current.computers,
          [computerKey]: nextComputer,
        },
      };
    });

    closeCellEditor();
  };

  const addComputer = () => {
    if (!payload) {
      return;
    }
    const key = newComputerKey.trim();
    const name = newComputerName.trim();
    if (!key || !name) {
      toast.error("Computer key and name are required.");
      return;
    }
    if (payload.computers[key]) {
      toast.error(`Computer key '${key}' already exists.`);
      return;
    }

    updatePayload((current) => ({
      ...current,
      computers: {
        ...current.computers,
        [key]: {
          name,
          url: newComputerUrl.trim(),
          compatibilityData: {},
          compatibilityNotes: {},
          incompatibleWith: [],
          partiallyCompatibleWith: [],
        },
      },
    }));

    setNewComputerKey("");
    setNewComputerName("");
    setNewComputerUrl("");
    setAddComputerOpen(false);
  };

  const addDock = () => {
    if (!payload) {
      return;
    }
    const key = newDockKey.trim();
    const name = newDockName.trim();
    if (!key || !name) {
      toast.error("Dock key and name are required.");
      return;
    }
    if (payload.docks[key]) {
      toast.error(`Dock key '${key}' already exists.`);
      return;
    }

    updatePayload((current) => ({
      ...current,
      docks: {
        ...current.docks,
        [key]: {
          name,
          url: newDockUrl.trim(),
        },
      },
    }));

    setNewDockKey("");
    setNewDockName("");
    setNewDockUrl("");
    setAddDockOpen(false);
  };

  const removeComputer = (computerKey: string) => {
    if (!payload) {
      return;
    }
    const computer = payload.computers[computerKey];
    if (!computer) {
      return;
    }
    if (!window.confirm(`Delete computer '${computer.name}'?`)) {
      return;
    }

    updatePayload((current) => {
      const nextComputers = { ...current.computers };
      delete nextComputers[computerKey];
      return {
        ...current,
        computers: nextComputers,
      };
    });
  };

  const removeDock = (dockKey: string) => {
    if (!payload) {
      return;
    }
    const dock = payload.docks[dockKey];
    if (!dock) {
      return;
    }
    if (!window.confirm(`Delete dock '${dock.name}'?`)) {
      return;
    }

    updatePayload((current) => {
      const nextDocks = { ...current.docks };
      delete nextDocks[dockKey];

      const nextComputers: Record<string, CompatibilityComputer> = {};
      for (const [computerKey, computer] of Object.entries(current.computers)) {
        const nextCompatibilityData = { ...(computer.compatibilityData ?? {}) };
        const nextCompatibilityNotes = { ...(computer.compatibilityNotes ?? {}) };
        delete nextCompatibilityData[dockKey];
        delete nextCompatibilityNotes[dockKey];

        nextComputers[computerKey] = {
          ...computer,
          compatibilityData: nextCompatibilityData,
          compatibilityNotes: nextCompatibilityNotes,
          incompatibleWith: (computer.incompatibleWith ?? []).filter((item) => item !== dockKey),
          partiallyCompatibleWith: (computer.partiallyCompatibleWith ?? []).filter((item) => item !== dockKey),
        };
      }

      return {
        ...current,
        docks: nextDocks,
        computers: nextComputers,
      };
    });
  };

  const handleSave = async () => {
    if (!payload || saving) {
      return;
    }
    setSaving(true);
    try {
      await compatibilityEditorStagingApi.saveData(payload);
      setInitialSnapshot(JSON.stringify(payload));
      toast.success("Compatibility Editor Staging saved.");
    } catch (error: any) {
      const message = extractApiErrorMessage(error, "Failed to save compatibility editor data.");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6 lg:p-8">
        <Card className="max-w-2xl mx-auto mt-12 border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Access denied</CardTitle>
            <CardDescription>
              Compatibility Editor Staging is available to admins only.
              {user?.email ? ` Signed in as ${user.email}.` : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8 space-y-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Compatibility Editor Staging</CardTitle>
              <CardDescription>
                Manage computer and dock compatibility matrix synced to the staging JSON.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setAddComputerOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Computer
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddDockOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Dock
              </Button>
              <Button type="button" onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-md border px-3 py-2">Computers: {sortedComputerKeys.length}</div>
            <div className="rounded-md border px-3 py-2">Docks: {sortedDockKeys.length}</div>
            <div className="rounded-md border px-3 py-2">{isDirty ? "Unsaved changes" : "All changes saved"}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {COMPATIBILITY_STATUS_OPTIONS.map((status) => (
              <span key={status} className={`rounded border px-2 py-1 ${STATUS_STYLE[status]}`}>
                {status}
              </span>
            ))}
            <span className="rounded border px-2 py-1 text-muted-foreground">* Note present</span>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compatibility Matrix</CardTitle>
          <CardDescription>
            Select any cell to edit compatibility status, diagnostics, and notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedComputerKeys.length === 0 || sortedDockKeys.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Add at least one computer and one dock to start editing compatibility.
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="sticky left-0 z-10 border-b border-r bg-muted/60 px-3 py-2 text-left font-medium">Computer</th>
                    {sortedDockKeys.map((dockKey) => {
                      const dock = payload?.docks[dockKey];
                      return (
                        <th key={dockKey} className="min-w-[180px] border-b border-r px-3 py-2 align-top text-left">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{dock?.name || dockKey}</div>
                              <div className="text-xs text-muted-foreground">{dockKey}</div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeDock(dockKey)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedComputerKeys.map((computerKey) => {
                    const computer = payload?.computers[computerKey];
                    if (!computer) {
                      return null;
                    }
                    return (
                      <tr key={computerKey} className="border-b last:border-b-0">
                        <td className="sticky left-0 z-10 border-r bg-background px-3 py-2 align-top">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{computer.name || computerKey}</div>
                              <div className="text-xs text-muted-foreground">{computerKey}</div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeComputer(computerKey)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                        {sortedDockKeys.map((dockKey) => {
                          const status = cellStatus(computer, dockKey);
                          const hasNotes = cellHasNotes(computer, dockKey);
                          return (
                            <td key={`${computerKey}-${dockKey}`} className="border-r px-2 py-2 align-middle">
                              <button
                                type="button"
                                className={`w-full rounded-md border px-3 py-2 text-xs font-medium transition-colors ${STATUS_STYLE[status]}`}
                                onClick={() => openCellEditor(computerKey, dockKey)}
                              >
                                {status}
                                {hasNotes ? " *" : ""}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addComputerOpen} onOpenChange={setAddComputerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Computer</DialogTitle>
            <DialogDescription>Create a new computer row for the matrix.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={newComputerKey} onChange={(event) => setNewComputerKey(event.target.value)} placeholder="Computer key (SKU)" />
            <Input value={newComputerName} onChange={(event) => setNewComputerName(event.target.value)} placeholder="Computer name" />
            <Input value={newComputerUrl} onChange={(event) => setNewComputerUrl(event.target.value)} placeholder="Computer URL (optional)" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddComputerOpen(false)}>Cancel</Button>
            <Button type="button" onClick={addComputer}>Add Computer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDockOpen} onOpenChange={setAddDockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Dock</DialogTitle>
            <DialogDescription>Create a new dock column for the matrix.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={newDockKey} onChange={(event) => setNewDockKey(event.target.value)} placeholder="Dock key (SKU)" />
            <Input value={newDockName} onChange={(event) => setNewDockName(event.target.value)} placeholder="Dock name" />
            <Input value={newDockUrl} onChange={(event) => setNewDockUrl(event.target.value)} placeholder="Dock URL (optional)" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddDockOpen(false)}>Cancel</Button>
            <Button type="button" onClick={addDock}>Add Dock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCell && cellEditorState)} onOpenChange={(open) => (!open ? closeCellEditor() : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Compatibility Cell</DialogTitle>
            <DialogDescription>
              {editingCell && payload
                ? `${payload.computers[editingCell.computerKey]?.name || editingCell.computerKey} x ${payload.docks[editingCell.dockKey]?.name || editingCell.dockKey}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {cellEditorState ? (
            <div className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Compatibility Status</span>
                <select
                  value={cellEditorState.status}
                  onChange={(event) =>
                    setCellEditorState((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as CompatibilityStatus,
                          }
                        : current
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {COMPATIBILITY_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cellEditorState.rebootNeeded}
                  onChange={(event) =>
                    setCellEditorState((current) =>
                      current
                        ? {
                            ...current,
                            rebootNeeded: event.target.checked,
                          }
                        : current
                    )
                  }
                />
                Reboot needed
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                {COMPATIBILITY_DETAIL_FIELDS.map((field) => (
                  <label key={field} className="block space-y-1 text-sm">
                    <span className="font-medium">{DETAIL_FIELD_LABELS[field]}</span>
                    <select
                      value={cellEditorState.detailByField[field]}
                      onChange={(event) =>
                        setCellEditorState((current) =>
                          current
                            ? {
                                ...current,
                                detailByField: {
                                  ...current.detailByField,
                                  [field]: event.target.value as CompatibilityDetailStatus | "",
                                },
                              }
                            : current
                        )
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Not set</option>
                      {COMPATIBILITY_DETAIL_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <label className="block space-y-1 text-sm">
                <span className="font-medium">Notes</span>
                <textarea
                  value={cellEditorState.notes}
                  onChange={(event) =>
                    setCellEditorState((current) =>
                      current
                        ? {
                            ...current,
                            notes: event.target.value,
                          }
                        : current
                    )
                  }
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Optional compatibility notes"
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCellEditor}>Cancel</Button>
            <Button type="button" onClick={saveCellEditor}>Apply Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
