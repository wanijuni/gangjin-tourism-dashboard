"""강진군 일별 날씨를 받아 docs/data/weather.json 으로 저장합니다.

자료: Open-Meteo 과거 기상 API (ERA5 재분석 기반, 강진군청 부근 좌표)
배포(GitHub Actions) 때마다 실행됩니다. 받지 못하면 경고만 남기고 넘어가며,
그때 대시보드는 날씨 표시 없이 동작합니다.
"""
import datetime as dt
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "weather.json"
LAT, LON = 34.6420, 126.7672  # 강진군청
START = dt.date(2022, 1, 1)


def main():
    end = dt.date.today() - dt.timedelta(days=6)  # 재분석 자료는 며칠 늦게 올라옴
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={LAT}&longitude={LON}&start_date={START}&end_date={end}"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,"
        "sunshine_duration,daylight_duration&timezone=Asia%2FSeoul"
    )
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            d = json.load(r)["daily"]
    except Exception as e:  # noqa: BLE001
        print(f"::warning::날씨 자료를 받지 못했습니다: {e}")
        return 0

    def r1(v):
        return None if v is None else round(v, 1)

    rows = {}
    for i, t in enumerate(d["time"]):
        tx, tn = d["temperature_2m_max"][i], d["temperature_2m_min"][i]
        if tx is None:
            continue
        sun, day = d["sunshine_duration"][i], d["daylight_duration"][i]
        ratio = round(sun / day, 2) if sun is not None and day else None
        rows[t.replace("-", "")] = [r1(tx), r1(tn), r1(d["precipitation_sum"][i]), r1(d["snowfall_sum"][i]), ratio]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "Open-Meteo 과거 기상(ERA5 재분석), 강진군청 부근 좌표",
        "cols": ["tmax", "tmin", "rain_mm", "snow_cm", "sun_ratio"],
        "rows": rows,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"날씨 {len(rows)}일 저장: {min(rows)}~{max(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
