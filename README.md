# 강진군 관광 데이터 대시보드

한국관광공사 데이터랩(datalab.visitkorea.or.kr)에서 내려받은 강진군 방문·소비·검색 데이터를 보여주는 대시보드입니다.

**대시보드 주소:** https://wanijuni.github.io/gangjin-tourism-dashboard/

## 매달 데이터 추가하는 법

1. 데이터랩에서 CSV 9개를 내려받습니다. 파일명은 **바꾸지 않습니다.**
   예: `202609_방문자 수 추이.csv` (또는 `2026년 9월_방문자 수 추이.csv`)
2. 이 저장소에서 `data/raw` 폴더로 들어갑니다.
3. **Add file → Upload files** 로 CSV를 끌어다 놓고 **Commit changes** 를 누릅니다.
4. 1~3분 뒤 대시보드에 새 달이 나타납니다. 진행 상황은 **Actions** 탭에서 볼 수 있습니다.

같은 달·같은 자료를 다시 올리면 새 파일로 덮어씁니다.
일별 파일(…추이) 안의 날짜가 파일명의 연·월과 다르면 그 달은 반영하지 않고, 대시보드 아래 **데이터 점검** 칸에 이유를 표시합니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `data/raw/` | 데이터랩 원본 CSV (여기에 올림) |
| `scripts/build_data.py` | CSV를 읽어 `docs/data/data.json` 으로 합치는 스크립트 |
| `docs/` | 대시보드 화면 (`index.html`, `app.js`, `style.css`, 차트 라이브러리 d3) |
| `.github/workflows/build.yml` | 올릴 때마다 합치기 → GitHub Pages 배포를 자동 실행 |

`docs/data/data.json` 은 배포할 때마다 새로 만들어지므로 저장소에는 올리지 않습니다.
