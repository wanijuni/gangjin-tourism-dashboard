"""data/raw 의 데이터랩 CSV를 읽어 docs/data/data.json 하나로 합칩니다.

파일명 규칙: "YYYYMM_<자료명>.csv"  (예: "202609_방문자 수 추이.csv")
            "YYYY년 M월_<자료명>.csv" 형식(예: "2026년 9월_방문자 수 추이.csv")도 읽습니다.
- 자료명은 데이터랩에서 내려받은 이름 그대로 두면 됩니다.
- 일별 파일(…추이)은 안에 든 날짜가 파일명의 연·월과 맞는지 확인합니다.
  맞지 않으면 그 달의 파일 전체를 건너뛰고 대시보드 하단 '데이터 점검'에 표시합니다.

외부 라이브러리 없이 파이썬 표준 라이브러리만 씁니다.
"""

import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "docs" / "data" / "data.json"
KST = timezone(timedelta(hours=9))

KINDS = {
    "방문자 수 추이": "visitors_daily",
    "관광소비 추이": "spend_daily",
    "검색건수 추이": "search_daily",
    "방문자 거주지": "origin",
    "지역별 방문자 수": "visitors_by_area",
    "지역별 지출액": "spend_by_area",
    "업종별 지출액": "industry",
    "지역별 검색건수": "search_area",
    "유형별 검색건수": "search_type",
}
DAILY = {"visitors_daily", "spend_daily", "search_daily"}
UNUSED = {"spend_by_area"}  # 대시보드에서 쓰지 않는 자료(요청으로 제외)
# 두 가지 이름을 모두 받습니다: "2026년 9월_자료명.csv" 또는 "202609_자료명.csv"
NAME_RE = re.compile(r"^(?:(\d{4})\s*년\s*(\d{1,2})\s*월|(\d{4})(\d{2}))[\s_]*(.+?)\.csv$", re.I)


def nfc(s):
    return unicodedata.normalize("NFC", s)


def num(v):
    v = (v or "").strip().replace(",", "")
    return float(v) if v else 0.0


def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        return []
    head = [nfc(h).strip() for h in rows[0]]
    return [dict(zip(head, r)) for r in rows[1:] if any(c.strip() for c in r)]


def r1(x):
    return round(x, 1)


def main():
    warnings, files = [], []
    found = defaultdict(dict)  # (kind) -> {month: (name, rows)}

    for path in sorted(RAW.glob("*")):
        if not path.is_file() or path.suffix.lower() != ".csv":
            continue
        name = nfc(path.name)
        m = NAME_RE.match(name)
        kind = None
        if m:
            label = re.sub(r"[_\s]+", " ", m.group(5)).strip()
            kind = KINDS.get(label)
            year, mon = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
            if not 1 <= int(mon) <= 12:
                kind = None
        if not m or not kind:
            warnings.append(f"{name}: 파일명을 알아볼 수 없어 건너뜀 (예: '202609_방문자 수 추이.csv')")
            files.append({"name": name, "status": "건너뜀"})
            continue
        month = f"{year}{int(mon):02d}"
        rows = read_rows(path)
        if month in found[kind]:
            warnings.append(f"{name}: 같은 달·같은 자료 파일이 이미 있어 이 파일로 덮어씀 ({found[kind][month][0]})")
        found[kind][month] = (name, rows)

    # 일별 파일: 안의 날짜가 파일명 월과 맞는지 확인
    bad_months = set()
    for kind in DAILY:
        for month, (name, rows) in found[kind].items():
            dates = {str(r.get("기준년월", "")).strip()[:6] for r in rows}
            if dates != {month}:
                shown = ", ".join(sorted(d for d in dates if d)) or "없음"
                warnings.append(f"{name}: 파일명은 {month[:4]}년 {int(month[4:])}월인데 안의 날짜는 {shown} → 이 달 자료 전체를 건너뜀")
                bad_months.add(month)

    for kind, by_month in found.items():
        for month, (name, rows) in sorted(by_month.items()):
            status = "사용 안 함" if kind in UNUSED else ("건너뜀" if month in bad_months else "반영")
            files.append({"name": name, "kind": kind, "month": month, "rows": len(rows), "status": status})

    def get(kind):
        return {m: rows for m, (n, rows) in found[kind].items() if m not in bad_months}

    # ---- 일별 합치기 ----
    daily = defaultdict(lambda: {"local": 0, "outsider": 0, "total": 0, "spend_k": 0, "search": 0})
    for month, rows in get("visitors_daily").items():
        for r in rows:
            d, t, n = r["기준년월"].strip(), r["방문자 구분"], num(r["방문자 수"])
            key = "total" if t.startswith("전체") else "outsider" if t.startswith("외지인") else "local" if t.startswith("현지인") else None
            if key:
                daily[d][key] = int(n)
    for month, rows in get("spend_daily").items():
        for r in rows:
            if r["중분류"] == "관광총소비":
                daily[r["기준년월"].strip()]["spend_k"] = int(num(r["소비액(천원)"]))
    for month, rows in get("search_daily").items():
        for r in rows:
            if r["카테고리중분류명"] == "전체":
                daily[r["기준년월"].strip()]["search"] = int(num(r["기초지자체 검색건수"]))
    daily_list = [{"date": d, "month": d[:6], **v} for d, v in sorted(daily.items())]

    # ---- 월별 핵심 지표 ----
    acc = defaultdict(lambda: {"total": 0, "outsider": 0, "local": 0, "spend_k": 0, "search": 0, "days": 0})
    for d in daily_list:
        a = acc[d["month"]]
        for k in ("total", "outsider", "local", "spend_k", "search"):
            a[k] += d[k]
        a["days"] += 1
    months = sorted(m for m in acc if m in get("visitors_daily"))

    def prev_month(m):
        y, mo = int(m[:4]), int(m[4:])
        return f"{y - 1}12" if mo == 1 else f"{y}{mo - 1:02d}"

    def pct(a, b):
        return r1((a / b - 1) * 100) if b else None

    monthly = []
    for m in months:
        a = acc[m]
        share = r1(a["outsider"] / a["total"] * 100) if a["total"] else None
        row = {"month": m, **a, "spend_eok": r1(a["spend_k"] / 1e5), "outsider_share_pct": share}
        for k, src in (("outsider_avg", "outsider"), ("total_avg", "total"), ("spend_avg_k", "spend_k"), ("search_avg", "search")):
            row[k] = round(a[src] / a["days"]) if a["days"] else None
        p = acc.get(prev_month(m)) if prev_month(m) in months else None
        row["spend_mom"] = pct(a["spend_k"], p["spend_k"]) if p else None
        row["outsider_mom"] = pct(a["outsider"], p["outsider"]) if p else None
        row["total_mom"] = pct(a["total"], p["total"]) if p else None
        row["search_mom"] = pct(a["search"], p["search"]) if p else None
        row["share_pp"] = r1(share - r1(p["outsider"] / p["total"] * 100)) if p and p["total"] and share is not None else None
        monthly.append(row)

    peak = []
    for m in months:
        ds = [d for d in daily_list if d["month"] == m]
        b = max(ds, key=lambda d: d["outsider"])
        peak.append({"month": m, "date": b["date"], "day_label": f"{int(b['date'][4:6])}월 {int(b['date'][6:8])}일", "outsider": b["outsider"]})

    # ---- 분포 자료 ----
    visitors_by_area = [{"month": m, "area": r["기초지자체명"], "visitors": int(num(r["기초지자체 방문자 수"])), "pct": num(r["기초지자체 방문자 비율"])}
                        for m, rows in get("visitors_by_area").items() for r in rows]
    origin = [{"month": m, "sido": r["거주지(시도)"], "sgg": r["거주지(시군구)"], "pct": num(r["비율(%)"])}
              for m, rows in get("origin").items() for r in rows]
    sido = defaultdict(float)
    for o in origin:
        sido[(o["month"], o["sido"])] += o["pct"]
    origin_sido = [{"month": m, "sido": s, "pct": r1(v)} for (m, s), v in sido.items()]

    industry_major, seen = [], set()
    for m, rows in get("industry").items():
        for r in rows:
            if (m, r["대분류"]) not in seen:
                seen.add((m, r["대분류"]))
                industry_major.append({"month": m, "major": r["대분류"], "pct": num(r["대분류 지출액 비율"])})

    cat = defaultdict(float)
    for m, rows in get("spend_daily").items():
        for r in rows:
            if r["중분류"] != "관광총소비":
                cat[(m, r["중분류"])] += num(r["소비액(천원)"])
    spend_cat = [{"month": m, "cat": c, "k": int(v), "mw": round(v / 1000)} for (m, c), v in cat.items() if v > 0]

    search_type = [{"month": m, "type": r["카테고리중분류명"], "n": int(num(r["유형별 검색건수"])), "pct": num(r["유형별 검색건수 비율"])}
                   for m, rows in get("search_type").items() for r in rows]
    search_area = [{"month": m, "area": r["기초지자체"], "area_n": int(num(r["기초지자체 검색건수"])), "type": r["카테고리중분류명"],
                    "n": int(num(r["중분류 검색건수"])), "pct": num(r["중분류 검색건수 비율"])}
                   for m, rows in get("search_area").items() for r in rows]

    # ---- 일별 업종·검색유형 (기간 비교에서 아무 기간이나 합산하기 위해) ----
    # 크기를 줄이려고 열 목록 + 날짜별 값 배열로 저장
    def columnar(kind, label_col, value_col, skip):
        vals = defaultdict(dict)
        for m, rows in get(kind).items():
            for r in rows:
                lab = r[label_col].strip()
                if lab in skip:
                    continue
                vals[r["기준년월"].strip()][lab] = vals[r["기준년월"].strip()].get(lab, 0) + int(num(r[value_col]))
        cols = sorted({c for v in vals.values() for c in v if any(vv.get(c) for vv in vals.values())})
        return {"cols": cols, "rows": {d: [v.get(c, 0) for c in cols] for d, v in sorted(vals.items())}}

    daily_cat = columnar("spend_daily", "중분류", "소비액(천원)", {"관광총소비"})
    daily_type = columnar("search_daily", "카테고리중분류명", "기초지자체 검색건수", {"전체"})

    out = {
        "generated": datetime.now(KST).isoformat(timespec="minutes"),
        "daily_cat": daily_cat,
        "daily_type": daily_type,
        "months": months,
        "warnings": warnings,
        "files": files,
        "monthly": monthly,
        "peak": peak,
        "daily": daily_list,
        "visitors_by_area": visitors_by_area,
        "origin": origin,
        "origin_sido": origin_sido,
        "industry_major": industry_major,
        "spend_cat": spend_cat,
        "search_type": search_type,
        "search_area": search_area,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"반영된 월: {', '.join(months) or '없음'}")
    for w in warnings:
        print("경고:", w)
    if not months:
        print("반영된 월이 없습니다. data/raw 의 파일명과 내용을 확인하세요.", file=sys.stderr)


if __name__ == "__main__":
    main()
