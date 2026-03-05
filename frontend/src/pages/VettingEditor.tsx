import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  vettingEditorApi,
  VETTING_EDITOR_CATEGORIES,
  VETTING_EDITOR_LEGACY_SECTION_ORDER,
  VETTING_EDITOR_SECTIONS,
  VETTING_EDITOR_VETTING_URL_SECTIONS,
  normalizeVettingEditorSection,
  type VettingEditorCategory,
  type VettingEditorItem,
  type VettingEditorPayload,
  type VettingEditorSection,
} from "../api/vettingEditor";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

type VettingEditorRow = {
  id: string;
  name: string;
  section: VettingEditorSection;
  category: VettingEditorCategory;
  url: string;
  vettingUrl: string;
};

const defaultSection: VettingEditorSection = VETTING_EDITOR_SECTIONS[0];
const defaultCategory: VettingEditorCategory = "ACCESSORIES";
const vettingUrlSections = new Set<VettingEditorSection>(VETTING_EDITOR_VETTING_URL_SECTIONS);

const sectionUsesVettingUrl = (section: VettingEditorSection): boolean => vettingUrlSections.has(section);

const formatSectionLabel = (section: VettingEditorSection): string => section.replace(/([a-z])([A-Z])/g, "$1 $2");

const formatCategoryLabel = (category: VettingEditorCategory): string =>
  category
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const createRow = (item?: Partial<VettingEditorRow>): VettingEditorRow => ({
  id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  name: item?.name ?? "",
  section: item?.section ?? defaultSection,
  category: item?.category ?? defaultCategory,
  url: item?.url ?? "",
  vettingUrl: item?.vettingUrl ?? "",
});

const flattenPayload = (payload: VettingEditorPayload): VettingEditorRow[] => {
  const rows: VettingEditorRow[] = [];
  for (const section of VETTING_EDITOR_SECTIONS) {
    for (const item of payload[section] ?? []) {
      rows.push(
        createRow({
          name: item.name,
          section,
          category: item.category,
          url: item.url,
          vettingUrl: item.vettingUrl ?? "",
        })
      );
    }
  }
  return rows;
};

const buildPayload = (rows: VettingEditorRow[]): VettingEditorPayload => {
  const sectionItemsByCanonicalSection: Partial<Record<VettingEditorSection, VettingEditorItem[]>> = {};

  for (const row of rows) {
    const canonicalSection = normalizeVettingEditorSection(row.section);
    if (!canonicalSection) {
      throw new Error(`Row has unsupported section '${row.section}'.`);
    }

    const name = row.name.trim();
    const url = row.url.trim();
    if (!name || !url) {
      throw new Error("Each row requires Name and Product URL.");
    }

    const item: VettingEditorItem = {
      name,
      category: row.category,
      url,
    };

    const vettingUrl = row.vettingUrl.trim();
    if (sectionUsesVettingUrl(canonicalSection) && vettingUrl) {
      item.vettingUrl = vettingUrl;
    }

    const sectionItems = sectionItemsByCanonicalSection[canonicalSection] ?? [];
    sectionItems.push(item);
    sectionItemsByCanonicalSection[canonicalSection] = sectionItems;
  }

  const payload: VettingEditorPayload = {};
  for (const section of VETTING_EDITOR_LEGACY_SECTION_ORDER) {
    const sectionItems = sectionItemsByCanonicalSection[section];
    if (!sectionItems) {
      continue;
    }
    payload[section] = sectionItems;
  }

  return payload;
};

export default function VettingEditor() {
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const [rows, setRows] = useState<VettingEditorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const rowCount = rows.length;

  const sectionCounts = useMemo(() => {
    const counts = Object.fromEntries(VETTING_EDITOR_SECTIONS.map((section) => [section, 0])) as Record<VettingEditorSection, number>;
    for (const row of rows) counts[row.section] += 1;
    return counts;
  }, [rows]);

  const sectionSummary = useMemo(
    () => VETTING_EDITOR_SECTIONS.map((section) => `${formatSectionLabel(section)} ${sectionCounts[section]}`).join(" · "),
    [sectionCounts]
  );

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        const payload = await vettingEditorApi.getData();
        setRows(flattenPayload(payload));
      } catch (error: any) {
        const message = error?.response?.data?.error || "Failed to load vetting data.";
        toast.error("Failed to load Vetting Editor", { description: message });
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [isAdmin]);

  const updateRow = (id: string, updater: (row: VettingEditorRow) => VettingEditorRow) => {
    setRows((current) => current.map((row) => (row.id === id ? updater(row) : row)));
  };

  const addRow = () => setRows((current) => [...current, createRow()]);

  const deleteRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(rows);
      await vettingEditorApi.saveData(payload);
      toast.success("Vetting data saved");
    } catch (error: any) {
      const fallback = error instanceof Error ? error.message : "Save failed.";
      const message = error?.response?.data?.error || fallback;
      toast.error("Failed to save Vetting Editor", { description: message });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading vetting editor...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vetting Editor</h1>
          <p className="text-sm text-muted-foreground">Admin-only vetting list editor.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access denied</CardTitle>
            <CardDescription>Admin access is required to view this page.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {user?.email ? `Signed in as ${user.email}.` : "You are not signed in."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vetting Editor</h1>
          <p className="text-sm text-muted-foreground">
            Manage products across the vetting lifecycle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={addRow} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-lift">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Products</CardTitle>
          <CardDescription>
            {rowCount} total · {sectionSummary}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No products found. Add a product to begin.
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Actions</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Product URL</TableHead>
                    <TableHead>Vetting URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Button type="button" size="sm" variant="destructive" onClick={() => deleteRow(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.name}
                          onChange={(event) =>
                            updateRow(row.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                           placeholder="e.g., Magic Keyboard"
                         />
                      </TableCell>
                      <TableCell>
                        <select
                          value={row.section}
                          onChange={(event) => {
                            const section = normalizeVettingEditorSection(event.target.value);
                            if (!section) {
                              return;
                            }
                            updateRow(row.id, (current) => ({
                              ...current,
                              section,
                              vettingUrl: sectionUsesVettingUrl(section) ? current.vettingUrl : "",
                            }));
                          }}
                          className="flex h-10 w-full min-w-[13rem] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {VETTING_EDITOR_SECTIONS.map((section) => (
                            <option key={section} value={section}>
                              {formatSectionLabel(section)}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <select
                          value={row.category}
                          onChange={(event) => {
                            const category = event.target.value as VettingEditorCategory;
                            updateRow(row.id, (current) => ({ ...current, category }));
                          }}
                          className="flex h-10 w-full min-w-[15rem] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {VETTING_EDITOR_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {formatCategoryLabel(category)}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.url}
                          onChange={(event) =>
                            updateRow(row.id, (current) => ({
                              ...current,
                              url: event.target.value,
                            }))
                          }
                          placeholder="e.g., https://store.example.com"
                        />
                      </TableCell>
                      <TableCell>
                        {sectionUsesVettingUrl(row.section) ? (
                          <Input
                            value={row.vettingUrl}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                vettingUrl: event.target.value,
                              }))
                            }
                            placeholder="e.g., https://store.example.com"
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
