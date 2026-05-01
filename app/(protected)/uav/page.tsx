"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Info, Pencil, Trash2 } from "lucide-react";
import { readClientSession } from "@/lib/client-auth";
import { splitCategoryLabels, uavBadgeStyle } from "@/lib/catalog-badges";
import { canManageUav } from "@/lib/permissions";
import { publicUploadDisplayUrl } from "@/lib/public-asset-url";
import { deleteUavItem, fetchUavItems, saveUavItem } from "@/lib/uav-repository";
import { CatalogItem } from "@/lib/types";

function specsToText(specs: CatalogItem["specs"]) {
  const lines = specs
    .filter((item) => item.key.trim().toLowerCase() !== "тип двигателя")
    .slice(0, 6)
    .map((item) => `${item.key}: ${item.value}`);
  while (lines.length < 6) lines.push("");
  return lines;
}

function normalizeSpecs(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      if (line.includes(":")) {
        const [left, ...rest] = line.split(":");
        return { key: left.trim() || `Параметр ${index + 1}`, value: rest.join(":").trim() };
      }
      return { key: `Параметр ${index + 1}`, value: line };
    });
}

function detectEngineType(specs: CatalogItem["specs"]): "электрический" | "двс" | "гибридный" {
  const candidate = specs.find((item) => item.key.trim().toLowerCase() === "тип двигателя")?.value.trim().toLowerCase();
  if (candidate === "двс") return "двс";
  if (candidate === "гибридный") return "гибридный";
  return "электрический";
}

const MASK = "••••••";

function specRevealKey(itemId: string, index: number) {
  return `${itemId}:${index}`;
}

type InlineDraft = {
  id: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  specsText: string[];
  engineType: "электрический" | "двс" | "гибридный";
};

export default function UavPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InlineDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const canInlineEdit = canManageUav(readClientSession());

  const [hideTtx, setHideTtx] = useState(false);
  const [revealedAll, setRevealedAll] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, true>>({});
  const [activeChipId, setActiveChipId] = useState<string | "all">("all");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const rows = await fetchUavItems();
      setItems(rows);
    } catch {
      setLoadError("Не удалось загрузить карточки БПЛА. Проверьте интернет и повторите попытку.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const refresh = async () => {
    await load();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 819px)");
    const apply = () => {
      const header = document.getElementById("mobile-app-header");
      if (!mq.matches || !header) {
        document.documentElement.style.removeProperty("--uav-sticky-below-header");
        return;
      }
      const h = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--uav-sticky-below-header", `${h}px`);
    };
    apply();
    const header = document.getElementById("mobile-app-header");
    const ro = header ? new ResizeObserver(apply) : null;
    if (header && ro) ro.observe(header);
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      ro?.disconnect();
      document.documentElement.style.removeProperty("--uav-sticky-below-header");
    };
  }, []);

  useEffect(() => {
    if (!zoomedSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomedSrc(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoomedSrc]);

  const computeActiveChipId = useCallback((): string | "all" => {
    if (typeof window === "undefined") return "all";
    if (window.scrollY < 40) return "all";
    const yRef = window.innerHeight * 0.22;
    let best: string | "all" = "all";
    let bestDist = 1e9;
    for (const item of items) {
      const el = cardRefs.current[item.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 72 || r.top > window.innerHeight * 0.94) continue;
      const anchor = r.top + Math.min(r.height * 0.22, 64);
      const d = Math.abs(anchor - yRef);
      if (d < bestDist) {
        bestDist = d;
        best = item.id;
      }
    }
    return best;
  }, [items]);

  useEffect(() => {
    if (!items.length) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setActiveChipId(computeActiveChipId()), 48);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (t) clearTimeout(t);
    };
  }, [items, computeActiveChipId]);

  const scrollToCard = (id: string) => {
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToListTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onChipNavigate = (target: string | "all") => {
    setActiveChipId(target);
    if (target === "all") scrollToListTop();
    else scrollToCard(target);
  };

  const onEdit = (item: CatalogItem) => {
    setEditingId(item.id);
    setMessage("");
    setDraft({
      id: item.id,
      title: item.title,
      category: item.category,
      image: item.image,
      summary: item.summary,
      specsText: specsToText(item.specs),
      engineType: detectEngineType(item.specs),
    });
  };

  const onSave = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return setMessage("Введите название.");
    if (!draft.image.trim()) return setMessage("Добавьте изображение.");
    const specs = normalizeSpecs(draft.specsText);
    if (specs.length < 6) return setMessage("Заполните 6 строк ТТХ.");

    setBusyId(draft.id);
    setMessage("");
    try {
      await saveUavItem({
        id: draft.id,
        title: draft.title.trim(),
        category: draft.category.trim() || "Без категории",
        image: draft.image.trim(),
        summary: draft.summary.trim(),
        specs: [...specs.slice(0, 6), { key: "Тип двигателя", value: draft.engineType }],
        details: { overview: "", tth: "", usage: "", materials: "" },
      });
      setEditingId(null);
      setDraft(null);
      setMessage("Изменения сохранены.");
      await refresh();
    } catch {
      setMessage("Не удалось сохранить изменения.");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (itemId: string) => {
    const target = items.find((entry) => entry.id === itemId);
    const approved =
      typeof window === "undefined" ? true : window.confirm(`Удалить карточку "${target?.title ?? "БПЛА"}"?`);
    if (!approved) return;
    setBusyId(itemId);
    setMessage("");
    try {
      await deleteUavItem(itemId);
      if (editingId === itemId) {
        setEditingId(null);
        setDraft(null);
      }
      setMessage("Карточка удалена.");
      await refresh();
    } catch {
      setMessage("Не удалось удалить карточку.");
    } finally {
      setBusyId(null);
    }
  };

  const revealOne = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: true }));
  };

  const showAllValues = () => {
    setRevealedAll(true);
    setRevealedKeys({});
  };

  return (
    <section style={{ minWidth: 0 }}>
      <div className="uav-page__head">
        <div className="uav-page__head-text">
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            ТТХ БПЛА
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Быстрый обзор и полная карточка с подробными характеристиками.
          </p>
        </div>
        {!!items.length && (
          <button
            type="button"
            className="uav-selfcheck-btn"
            onClick={() => {
              if (hideTtx) {
                setRevealedAll(false);
                setRevealedKeys({});
              }
              setHideTtx((v) => !v);
            }}
            aria-pressed={hideTtx}
          >
            {hideTtx ? (
              <>
                <Eye width={18} height={18} strokeWidth={2} aria-hidden />
                Показать ТТХ
              </>
            ) : (
              <>
                <EyeOff width={18} height={18} strokeWidth={2} aria-hidden />
                Скрыть ТТХ
              </>
            )}
          </button>
        )}
      </div>

      {hideTtx && !!items.length && (
        <div className="selfcheck-hint" role="status">
          <div className="selfcheck-hint__text">
            <Info width={18} height={18} strokeWidth={2} aria-hidden />
            <span>
              Режим самопроверки включён. Характеристики скрыты. Нажмите на значение, чтобы проверить себя.
            </span>
          </div>
          <div className="selfcheck-hint__actions">
            <button type="button" className="btn btn--icon-text" onClick={showAllValues} disabled={revealedAll}>
              <Eye width={16} height={16} strokeWidth={2} aria-hidden />
              Показать всё
            </button>
          </div>
        </div>
      )}

      {loading && <p className="page-subtitle">Загрузка карточек БПЛА...</p>}
      {!loading && !!loadError && (
        <div className="form" style={{ marginBottom: 12 }}>
          <p className="page-subtitle">{loadError}</p>
          <button className="btn" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="page-subtitle">
          Пока нет доступных карточек БПЛА. Проверьте подключение к сети и обновите страницу.
        </p>
      )}
      {message && <p className="page-subtitle">{message}</p>}

      {!!items.length && (
        <div className="uav-model-nav">
          <div className="chips">
            <button
              type="button"
              className={`chip${activeChipId === "all" ? " active" : ""}`}
              onClick={() => onChipNavigate("all")}
            >
              Все
            </button>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${activeChipId === item.id ? " active" : ""}`}
                onClick={() => onChipNavigate(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-two">
        {items.map((item) => {
          const imageSrc = publicUploadDisplayUrl(item.image);
          const badges = splitCategoryLabels(item.category);
          const displaySpecs = item.specs.slice(0, 7);
          return (
            <article
              className="card catalog-card-anchor"
              key={item.id}
              ref={(el) => {
                cardRefs.current[item.id] = el;
              }}
              data-catalog-card={item.id}
            >
              <div
                style={{
                  position: "relative",
                  cursor: imageSrc && !imgErrors[item.id] ? "zoom-in" : "default",
                  overflow: "hidden",
                }}
                onClick={() => {
                  if (!imageSrc || imgErrors[item.id]) return;
                  setZoomedSrc(imageSrc);
                }}
              >
                {imgErrors[item.id] || !imageSrc ? (
                  <div
                    style={{
                      width: "100%",
                      height: 200,
                      background: "var(--panel2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--muted)",
                      fontSize: 13,
                    }}
                  >
                    Нет изображения
                  </div>
                ) : (
                  <>
                    <img
                      src={imageSrc}
                      alt={item.title}
                      decoding="async"
                      loading="lazy"
                      onError={() => setImgErrors((prev) => ({ ...prev, [item.id]: true }))}
                      style={{
                        width: "100%",
                        height: 200,
                        objectFit: "cover",
                        objectPosition: "top center",
                        display: "block",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 90,
                        zIndex: 1,
                        background:
                          "linear-gradient(to top, rgba(7,9,13,0.95) 0%, rgba(7,9,13,0.4) 50%, transparent 100%)",
                        pointerEvents: "none",
                      }}
                    />
                  </>
                )}
              </div>
              <div className="card-body">
                <div className="catalog-badge-row" style={{ marginTop: 4 }}>
                  {(badges.length ? badges : [item.category].filter(Boolean)).map((label, bi) => {
                    const tone = uavBadgeStyle(label);
                    return (
                      <span key={`${item.id}-b-${bi}-${label}`} className="catalog-badge" style={tone} title={label}>
                        {label}
                      </span>
                    );
                  })}
                </div>
                {editingId === item.id && draft ? (
                  <div className="form" style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      value={draft.title}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                    />
                    <input
                      className="input"
                      value={draft.category}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                    />
                    <textarea
                      className="input"
                      rows={2}
                      value={draft.summary}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, summary: e.target.value } : prev))}
                    />
                    <input
                      className="input"
                      value={draft.image}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, image: e.target.value } : prev))}
                    />
                    {draft.specsText.map((line, index) => (
                      <input
                        key={`uav-inline-spec-${item.id}-${index}`}
                        className="input"
                        placeholder={`ТТХ ${index + 1}: ...`}
                        value={line}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  specsText: prev.specsText.map((oldLine, idx) =>
                                    idx === index ? e.target.value : oldLine,
                                  ),
                                }
                              : prev,
                          )
                        }
                      />
                    ))}
                    <select
                      className="select"
                      value={draft.engineType}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, engineType: e.target.value as InlineDraft["engineType"] } : prev,
                        )
                      }
                    >
                      <option value="электрический">электрический</option>
                      <option value="двс">двс</option>
                      <option value="гибридный">гибридный</option>
                    </select>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-primary" type="button" onClick={() => void onSave()} disabled={busyId === item.id}>
                        Сохранить
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setDraft(null);
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 style={{ marginTop: 8 }}>{item.title}</h3>
                    <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 8, fontSize: 13 }}>
                      {item.summary}
                    </p>
                    <p className="label" style={{ marginBottom: 6 }}>
                      Ключевые характеристики
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                        gap: 6,
                      }}
                    >
                      {displaySpecs.map((spec, index) => {
                        const rk = specRevealKey(item.id, index);
                        const masked =
                          hideTtx && !revealedAll && !revealedKeys[rk] && spec.value.trim().length > 0;
                        return (
                          <div
                            key={`${item.id}-${spec.key}-${index}`}
                            style={{
                              gridColumn: index === 6 ? "1 / -1" : undefined,
                              padding: "7px 10px",
                              background: "var(--glass)",
                              borderRadius: 10,
                              border: "1px solid var(--line)",
                              minWidth: 0,
                            }}
                          >
                            <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.3 }}>{spec.key}</p>
                            {masked ? (
                              <button
                                type="button"
                                className="ttx-masked"
                                style={{
                                  marginTop: 2,
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  border: "none",
                                  background: "transparent",
                                  font: "inherit",
                                }}
                                onClick={() => revealOne(rk)}
                              >
                                {MASK}
                              </button>
                            ) : (
                              <p
                                style={{
                                  marginTop: 2,
                                  fontWeight: 700,
                                  fontSize: 13,
                                  overflowWrap: "anywhere",
                                  wordBreak: "break-word",
                                }}
                              >
                                {spec.value}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {canInlineEdit && (
                  <div className="catalog-card-actions">
                    <button
                      className="btn"
                      style={{ width: 38, height: 34, padding: 0 }}
                      type="button"
                      title="Редактировать"
                      onClick={() => onEdit(item)}
                    >
                      <span className="sr-only">Редактировать</span>
                      <Pencil width={18} height={18} strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ width: 38, height: 34, padding: 0 }}
                      type="button"
                      title="Удалить"
                      onClick={() => void onDelete(item.id)}
                      disabled={busyId === item.id}
                    >
                      <span className="sr-only">Удалить</span>
                      <Trash2 width={18} height={18} strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {zoomedSrc && (
        <div
          onClick={() => setZoomedSrc(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            cursor: "zoom-out",
          }}
        >
          <img
            src={zoomedSrc}
            alt=""
            decoding="async"
            loading="lazy"
            style={{
              maxWidth: "100%",
              maxHeight: "90vh",
              borderRadius: 16,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              objectFit: "contain",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomedSrc(null)}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              borderRadius: "50%",
              width: 40,
              height: 40,
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
