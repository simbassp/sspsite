"use client";

import { FormEvent, useEffect, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { createNews, fetchNews } from "@/lib/news-repository";
import { NewsItem } from "@/lib/types";

export default function AdminNewsPage() {
  const session = readClientSession();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"high" | "normal">("normal");
  const [info, setInfo] = useState("");

  useEffect(() => {
    fetchNews().then((rows) => setNews(rows));
  }, []);

  const refresh = async () => {
    const rows = await fetchNews();
    setNews(rows);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await createNews({
      title,
      body,
      priority,
      author: session?.name || session?.callsign || "Редактор",
    });
    if (!result.ok) {
      setInfo(`Supabase недоступен, сохранено локально. Причина: ${result.error}`);
    } else {
      setInfo("Новость опубликована.");
    }
    setTitle("");
    setBody("");
    setPriority("normal");
    await refresh();
  };

  return (
    <section>
      <h1 className="page-title">Админ / Новости</h1>
      <div className="card">
        <div className="card-body">
          <form className="form" onSubmit={onSubmit}>
            <input className="input" placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea
              className="input"
              placeholder="Текст новости"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 120 }}
              required
            />
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="normal">Обычная</option>
              <option value="high">Важная</option>
            </select>
            <button className="btn btn-primary" type="submit">
              Опубликовать
            </button>
            {info && <p className="page-subtitle">{info}</p>}
          </form>
        </div>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {news.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-body">
              <h3>{item.title}</h3>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                {item.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
