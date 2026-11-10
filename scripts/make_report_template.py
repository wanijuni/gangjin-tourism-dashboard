"""보고서 양식(report/보고서양식_원본.hwpx)으로 '한장요약' 한글 파일의 틀을 만듭니다.

결과: docs/report/template.hwpx (본문 자리표시 {{DATE}} {{TITLE}} {{BODY}})
      docs/report/parts.js     (Ⅰ·Ⅱ 제목 상자, 문단, 글자 모양 조각)
양식을 바꾸고 싶으면 원본 hwpx를 바꾼 뒤 이 스크립트를 다시 실행하세요.
"""
import io, json, pathlib, re, struct, zipfile, zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "report" / "보고서양식_원본.hwpx"
OUT = ROOT / "docs" / "report"


def tops(body):
    depth, out, st = 0, [], 0
    for m in re.finditer(r"<(/?)hp:p(?=[ >])", body):
        if m.group(1) == "":
            if depth == 0:
                st = m.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append((st, body.index(">", m.start()) + 1))
    return out


def tiny_png():
    raw = b"\x00\xff\xff\xff"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def main():
    z = zipfile.ZipFile(SRC)
    files = {n: z.read(n) for n in z.namelist()}
    order = z.namelist()
    sec = files["Contents/section0.xml"].decode("utf-8")
    sec = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", sec, flags=re.S)  # 한글이 열 때 줄 배치를 다시 계산
    a = sec.index(">", sec.index("<hs:sec")) + 1
    b = sec.rindex("</hs:sec>")
    body = sec[a:b]
    T = [body[s:e] for s, e in tops(body)]
    p0, p1, psec, pline, pblank = T[0], T[1], T[2], T[3], T[6]
    # 머리 상자: 날짜 자리
    p0 = re.sub(r"<hp:t>'\d+\. \d+\. \d+\.\([^)]*\) ", "<hp:t>{{DATE}} ", p0, count=1)
    p1 = p1.replace("강진군 전직원 SNS 홍보영상 이벤트", "{{TITLE}}")
    sec = sec[:a] + p0 + p1 + "{{BODY}}" + sec[b:]
    files["Contents/section0.xml"] = sec.encode("utf-8")
    # Ⅰ 제목 상자 조각
    psec = psec.replace("<hp:t>Ⅰ</hp:t>", "<hp:t>{{NUM}}</hp:t>").replace("<hp:t> 행 사 개 요</hp:t>", "<hp:t> {{HEAD}}</hp:t>")
    psec = re.sub(r'(<hp:p id=")\d+(")', r"\g<1>{{PID}}\2", psec, count=1)
    psec = re.sub(r'(<hp:tbl id=")\d+(")', r"\g<1>{{TID}}\2", psec, count=1)
    line = re.sub(r"<hp:run charPrIDRef=\"19\"><hp:t>.*?</hp:t></hp:run>", "{{RUNS}}", pline, count=1, flags=re.S)
    # 빨간 글자 모양 추가 (증가 ▲ 표시용): 파랑(26)을 복사
    hdr = files["Contents/header.xml"].decode("utf-8")
    n = int(re.search(r'<hh:charProperties itemCnt="(\d+)">', hdr).group(1))
    blue = re.search(r'<hh:charPr id="26".*?</hh:charPr>', hdr, re.S).group(0)
    red = blue.replace('id="26"', f'id="{n}"').replace('textColor="#0000FF"', 'textColor="#E8000B"')
    hdr = hdr.replace(f'<hh:charProperties itemCnt="{n}">', f'<hh:charProperties itemCnt="{n + 1}">')
    hdr = hdr.replace("</hh:charProperties>", red + "</hh:charProperties>", 1)
    files["Contents/header.xml"] = hdr.encode("utf-8")
    # 경품 사진(image2~5)은 빼고 머리 상자의 그림(image1)만 남김
    hpf = files["Contents/content.hpf"].decode("utf-8")
    for i in range(2, 6):
        hpf = re.sub(rf'<opf:item id="image{i}"[^>]*/>', "", hpf)
        files.pop(f"BinData/image{i}.bmp", None)
        hpf = re.sub(rf'<opf:itemref idref="image{i}"[^>]*/>', "", hpf)
    files["Contents/content.hpf"] = hpf.encode("utf-8")
    files["Preview/PrvText.txt"] = "강진군 관광 데이터 한장요약".encode("utf-8")
    files["Preview/PrvImage.png"] = tiny_png()
    OUT.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as w:
        for name in [x for x in order if x in files]:
            w.writestr(zipfile.ZipInfo(name), files[name], compress_type=zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED)
    (OUT / "template.hwpx").write_bytes(buf.getvalue())
    parts = {"sec": psec, "line": line, "blank": pblank, "red": n, "blue": 26, "normal": 19, "note": 29}
    (OUT / "parts.js").write_text("// make_report_template.py 가 만든 파일입니다. 직접 고치지 마세요.\nwindow.REPORT_PARTS = " + json.dumps(parts, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("template.hwpx", len(buf.getvalue()), "bytes; red charPr", n)


if __name__ == "__main__":
    main()
