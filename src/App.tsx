import { useEffect, useRef, useReducer, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  House,
  Leaf,
  MapPin,
  MoreHorizontal,
  Plus,
  Ruler,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Trash2,
  UserRound,
  Users,
  X,
  Compass,
  LoaderCircle,
  ArrowLeft,
} from "lucide-react";
import { api, ApiError } from "./api";
import { categories, type MemoryRecord, type Subject } from "./model";
import { attributeLabel } from "./fields";
import { StructuredValue } from "./StructuredValue";
import { CollectionOverview } from "./components/CollectionOverview";
import { ExploreView, PeopleView } from "./components/BrowseViews";
import { MobileNavigation, type AppTab } from "./components/MobileNavigation";
import { Login } from "./components/Login";
import { sessionReducer } from "./session";
import { Button } from "./components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { ConfirmDialog } from "./components/ui/alert-dialog";
import { ErrorNotice } from "./components/ErrorNotice";
import { MemoryForm } from "./components/MemoryForm";
import { AddSubject, History } from "./components/MemoryDialogs";
import { Settings } from "./components/Settings";
const icons: Record<string, typeof UserRound> = {
  profile: UserRound,
  measurements: Ruler,
  health: Heart,
  people: Users,
  places: MapPin,
  notes: StickyNote,
};
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
export default function App() {
  const [session, dispatch] = useReducer(sessionReducer, {
    phase: "checking",
    username: null,
  });
  const [failure, setFailure] = useState<Error | null>(null);
  const check = () => {
    setFailure(null);
    api<{ username: string }>("/api/session")
      .then((result) => {
        if (typeof result.username !== "string" || !result.username)
          throw new Error("Could not open your session. Please try again.");
        dispatch({ type: "signed-in", username: result.username });
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401)
          dispatch({ type: "expired" });
        else setFailure(error);
      });
  };
  useEffect(() => {
    check();
    const expire = () => dispatch({ type: "expired" });
    window.addEventListener("memory-session-expired", expire);
    return () => window.removeEventListener("memory-session-expired", expire);
  }, []);
  if (session.phase === "checking")
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="grid justify-items-center gap-5 text-primary">
          <Leaf size={38} />
          {failure ? (
            <>
              <p
                role="alert"
                className="max-w-xs text-center text-sm text-muted-foreground"
              >
                {failure.message}
              </p>
              <Button onClick={check}>Try again</Button>
            </>
          ) : (
            <LoaderCircle
              size={21}
              className="animate-spin motion-reduce:animate-none"
              aria-label="Opening Memory"
            />
          )}
        </div>
      </div>
    );
  if (session.phase === "anonymous")
    return (
      <Login
        onSignedIn={(username) => dispatch({ type: "signed-in", username })}
      />
    );
  return (
    <MemoryApp
      onSignOut={async () => {
        await api("/api/auth/logout", { method: "POST", body: "{}" });
        dispatch({ type: "signed-out" });
      }}
    />
  );
}
function MemoryApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [subjects, setSubjects] = useState<Subject[]>([
    { id: "self", name: "Me", kind: "person" },
  ]);
  const [subject, setSubject] = useState("self");
  const [tab, setTab] = useState<AppTab>("home");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<MemoryRecord | "new" | null>(null);
  const [history, setHistory] = useState<MemoryRecord | null>(null);
  const [retract, setRetract] = useState<MemoryRecord | null>(null);
  const [retractBusy, setRetractBusy] = useState(false);
  const [retractError, setRetractError] = useState<Error | null>(null);
  const [settings, setSettings] = useState(false);
  const [addSubject, setAddSubject] = useState(false);
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("memory-theme") || "system",
  );
  const requestId = useRef(0);
  useEffect(() => {
    const expire = (event: Event) => {
      requestId.current++;
      setRecords([]);
      setSubjects([{ id: "self", name: "Me", kind: "person" }]);
      setEditor(null);
      setHistory(null);
      setRetract(null);
      setSettings(false);
      setAddSubject(false);
      setLoading(false);
      setError((event as CustomEvent<Error>).detail);
    };
    window.addEventListener("memory-session-expired", expire);
    return () => window.removeEventListener("memory-session-expired", expire);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("memory-theme", theme);
  }, [theme]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    api<{ subjects: Subject[] }>("/api/subjects")
      .then((data) => setSubjects(data.subjects))
      .catch(setError);
  }, [revision]);
  async function load(more = false) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ subject_id: subject, limit: "60" });
    if (category !== "all") params.set("category", category);
    if (query) params.set("q", query);
    if (more && cursor) params.set("cursor", cursor);
    try {
      const data = await api<{
        records: MemoryRecord[];
        next_cursor: string | null;
      }>(`/api/records?${params}`);
      if (id !== requestId.current) return;
      setRecords((previous) =>
        more ? [...previous, ...data.records] : data.records,
      );
      setCursor(data.next_cursor);
    } catch (e) {
      if (id === requestId.current) setError(e as Error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRecords([]);
    setCursor(null);
    void load();
    return () => {
      requestId.current++;
    };
  }, [subject, category, query, revision]);
  const current = subjects.find((s) => s.id === subject);
  const selected = categories.find((c) => c.id === category);
  const visibleGroups =
    category === "all"
      ? [
          ...categories.map((c) => c.id),
          ...new Set(
            records
              .map((r) => r.category)
              .filter((c) => !categories.some((known) => known.id === c)),
          ),
        ]
      : [category];
  const refresh = () => setRevision((value) => value + 1);
  const navigate = (next: string) => {
    setTab(next as AppTab);
    setCategory("all");
    setSearch("");
    setQuery("");
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const openCategory = (next: string) => {
    setTab("explore");
    setCategory(next);
    setSearch("");
    setQuery("");
    scrollRef.current?.scrollTo({ top: 0 });
  };
  return (
    <Tabs value={tab} onValueChange={navigate} className="app">
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="Memory home">
          <span className="brand-mark">
            <Leaf size={25} />
          </span>
          memory<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-caption">Your personal space</div>
        <div className="subject-box">
          <span className="avatar">
            <UserRound size={20} />
          </span>
          <label className="subject-label">
            <span>Remembering</span>
            <select
              aria-label="Remembering"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Add a person or place"
            onClick={() => setAddSubject(true)}
          >
            <Plus size={17} />
          </button>
        </div>
        <TabsList
          aria-label="Desktop navigation"
          className="desktop-navigation flex w-full flex-col items-stretch gap-1 bg-transparent p-0"
        >
          {[
            { id: "home", name: "Home", Icon: House },
            { id: "explore", name: "Explore", Icon: Compass },
            { id: "people", name: "People", Icon: Users },
            { id: "settings", name: "Settings", Icon: Settings2 },
          ].map(({ id, name, Icon }) => (
            <TabsTrigger
              value={id}
              key={id}
              className="justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Icon size={19} />
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-8 px-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
          Collections
        </div>
        <nav className="mt-3 grid gap-1" aria-label="Memory categories">
          {categories.slice(0, 6).map((category) => (
            <button
              className="rounded-xl px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
              key={category.id}
              onClick={() => openCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Sparkles size={19} />
            <p>
              Life is full of little details.
              <br />
              Give them a place to stay.
            </p>
          </div>
          <button
            className="settings-button"
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            Settings
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar app-header">
          <div className="flex items-center gap-3">
            {tab === "explore" && category !== "all" ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Back to Explore"
                onClick={() => navigate("explore")}
              >
                <ArrowLeft />
              </Button>
            ) : (
              <span className="header-mark flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Leaf size={23} />
              </span>
            )}
            <span className="header-title text-lg font-semibold tracking-tight">
              {tab === "home"
                ? "memory."
                : tab === "explore"
                  ? selected?.name || "Explore"
                  : tab === "people"
                    ? "People"
                    : "Settings"}
            </span>
          </div>
          <button
            className="header-avatar flex size-10 items-center justify-center rounded-full border border-[#e8dbe6] bg-[#eee4eb] text-xs font-semibold text-[#9a7895]"
            aria-label="Choose person or place"
            onClick={() => navigate("people")}
          >
            {current?.name.slice(0, 1).toUpperCase() || "M"}
          </button>
        </header>
        <TabsContent value={tab} className="content app-scroll" ref={scrollRef}>
          {tab === "people" ? (
            <PeopleView
              subjects={subjects}
              onAdd={() => setAddSubject(true)}
              onSelect={(id) => {
                setSubject(id);
                navigate("home");
              }}
            />
          ) : tab === "settings" ? (
            <Settings
              embedded
              onClose={() => navigate("home")}
              onImported={refresh}
              theme={theme}
              setTheme={setTheme}
              onSignOut={onSignOut}
            />
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    {current?.name === "Me"
                      ? "YOUR SPACE"
                      : `REMEMBERING ${current?.name || ""}`}
                  </div>
                  <h1>
                    {tab === "explore"
                      ? selected?.name || "Explore your memories"
                      : current?.name === "Me"
                        ? "Your memories"
                        : current?.name || "Your memories"}
                  </h1>
                  <p>
                    {selected?.description ||
                      "What would you like to remember?"}
                  </p>
                </div>
                <button
                  className="button primary new-memory hidden md:inline-flex"
                  onClick={() => setEditor("new")}
                >
                  <Plus size={18} />
                  New memory
                </button>
              </section>
              <div className="search-row">
                <label className="search">
                  <Search size={19} />
                  <input
                    type="search"
                    aria-label="Search memories"
                    placeholder="Find a memory…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                <span className="record-count">
                  {loading
                    ? "Loading…"
                    : `${records.length}${cursor ? "+" : ""} ${records.length === 1 ? "memory" : "memories"}`}
                </span>
              </div>
              <div className="mobile-filters">
                <label>
                  <span className="visually-hidden">About</span>
                  <select
                    aria-label="About"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="icon-button"
                  aria-label="Add a person or place"
                  onClick={() => setAddSubject(true)}
                >
                  <Plus size={18} />
                </button>
              </div>
              <ErrorNotice error={error} retry={() => void load()} />
              {tab === "explore" && category === "all" && !query ? (
                <ExploreView records={records} onCategory={openCategory} />
              ) : loading && !records.length ? (
                <div
                  className="loading-grid"
                  aria-label="Loading memories"
                  role="status"
                >
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="skeleton" />
                  ))}
                </div>
              ) : !records.length && !error ? (
                <section className="empty-state">
                  <div className="empty-art" aria-hidden="true">
                    <div className="art-orbit" />
                    <div className="art-card back" />
                    <div className="art-card front">
                      <Leaf size={36} />
                      <span />
                      <span />
                    </div>
                    <Sparkles className="art-spark" size={25} />
                    <span className="art-dot" />
                  </div>
                  <span className="eyebrow">
                    {query ? "A FRESH SEARCH" : "ROOM FOR YOUR STORY"}
                  </span>
                  <h2>
                    {query ? "No memories found." : "Add your first memory"}
                  </h2>
                  <p>
                    {query
                      ? "Try another word, or look in a different category."
                      : "Choose a field, add a value, and keep it here."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => (query ? setSearch("") : setEditor("new"))}
                  >
                    {query ? (
                      "Clear search"
                    ) : (
                      <>
                        <Plus size={17} />
                        Add your first memory
                      </>
                    )}
                  </button>
                  {!query && (
                    <div className="empty-suggestions">
                      <span>Make it yours</span>
                      {[
                        {
                          id: "profile",
                          label: "A personal detail",
                          Icon: UserRound,
                        },
                        {
                          id: "measurements",
                          label: "A measurement",
                          Icon: Ruler,
                        },
                        {
                          id: "places",
                          label: "A place you lived",
                          Icon: MapPin,
                        },
                      ].map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          onClick={() => {
                            setCategory(id);
                            setEditor("new");
                          }}
                        >
                          <Icon size={16} />
                          {label}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              ) : category === "all" && !query ? (
                <>
                  <CollectionOverview
                    records={records}
                    onCategory={openCategory}
                    onEdit={setEditor}
                    hasMore={!!cursor}
                  />
                  {cursor && (
                    <Button
                      variant="secondary"
                      className="mx-auto mt-6 flex"
                      disabled={loading}
                      onClick={() => void load(true)}
                    >
                      {loading ? "Loading…" : "Load more"}
                    </Button>
                  )}
                </>
              ) : (
                <div className="memory-groups">
                  {visibleGroups.map((group) => {
                    const groupRecords = records.filter(
                      (record) => record.category === group,
                    );
                    if (!groupRecords.length) return null;
                    const config = categories.find((c) => c.id === group);
                    const Icon =
                      icons[group as keyof typeof icons] || StickyNote;
                    return (
                      <section
                        key={group}
                        className={`memory-group category-${group}`}
                      >
                        <header className="group-header">
                          <span className="category-icon">
                            <Icon size={17} />
                          </span>
                          <h2>{config?.name || group}</h2>
                          <span>{groupRecords.length}</span>
                          <button
                            className="icon-button"
                            aria-label={`Add ${config?.name || group} memory`}
                            onClick={() => {
                              setCategory(group);
                              setEditor("new");
                            }}
                          >
                            <Plus size={17} />
                          </button>
                        </header>
                        <div className="card-grid">
                          {groupRecords.map((record) => (
                            <article className="memory-card" key={record.id}>
                              <div className="card-heading">
                                <h3>{attributeLabel(record.attribute)}</h3>
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${attributeLabel(record.attribute)}`}
                                  onClick={() => setEditor(record)}
                                >
                                  <MoreHorizontal size={19} />
                                </button>
                              </div>
                              <div
                                className={
                                  typeof record.value === "object"
                                    ? "memory-value structured"
                                    : "memory-value"
                                }
                              >
                                <StructuredValue
                                  value={record.value}
                                  unit={record.unit}
                                />
                              </div>
                              {record.valid_from && (
                                <p className="date-range">
                                  <MapPin size={13} />
                                  {date(record.valid_from)} —{" "}
                                  {record.valid_to
                                    ? date(record.valid_to)
                                    : "Present"}
                                </p>
                              )}
                              <footer className="card-footer">
                                <span>
                                  <span className="tiny-dot" />
                                  {record.observed_at
                                    ? date(record.observed_at)
                                    : `Updated ${date(record.updated_at)}`}
                                </span>
                                <div>
                                  <button
                                    className="icon-button"
                                    aria-label={`History of ${attributeLabel(record.attribute)}`}
                                    onClick={() => setHistory(record)}
                                  >
                                    <Clock3 size={15} />
                                  </button>
                                  <button
                                    className="icon-button retract-button"
                                    aria-label={`Retract ${attributeLabel(record.attribute)}`}
                                    onClick={() => {
                                      setRetractError(null);
                                      setRetract(record);
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </footer>
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {cursor && (
                    <button
                      className="button secondary load-more"
                      disabled={loading}
                      onClick={() => void load(true)}
                    >
                      {loading ? "Loading…" : "Load more memories"}
                      <ChevronDown size={17} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </main>
      <MobileNavigation
        showAdd={tab === "home" || tab === "explore"}
        onAdd={() => setEditor("new")}
      />
      {editor && (
        <MemoryForm
          record={editor === "new" ? undefined : editor}
          subject={subject}
          category={category === "all" ? "profile" : category}
          subjects={subjects}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setToast("Memory saved");
            refresh();
          }}
        />
      )}
      {addSubject && (
        <AddSubject
          onClose={() => setAddSubject(false)}
          onSaved={(s) => {
            setSubjects((previous) => [...previous, s]);
            setSubject(s.id);
            setAddSubject(false);
            setToast("Added to your space");
          }}
        />
      )}
      {history && <History record={history} onClose={() => setHistory(null)} />}{" "}
      {settings && (
        <Settings
          onSignOut={onSignOut}
          theme={theme}
          setTheme={setTheme}
          onClose={() => setSettings(false)}
          onImported={refresh}
        />
      )}{" "}
      {retract && (
        <ConfirmDialog
          title="Retract this memory?"
          description={`“${attributeLabel(retract.attribute)}” will leave your collection. Previous versions stay in your exported history.`}
          onClose={() => setRetract(null)}
          busy={retractBusy}
          confirmLabel="Retract memory"
          onConfirm={async () => {
            setRetractBusy(true);
            try {
              await api(`/api/records/${retract.id}`, {
                method: "DELETE",
                body: JSON.stringify({ expected_revision: retract.revision }),
              });
              setRetract(null);
              setToast("Memory retracted");
              refresh();
            } catch (error) {
              setRetractError(error as Error);
            } finally {
              setRetractBusy(false);
            }
          }}
        >
          <ErrorNotice error={retractError} />
        </ConfirmDialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </Tabs>
  );
}
