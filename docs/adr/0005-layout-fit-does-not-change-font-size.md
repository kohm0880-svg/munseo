# ADR 0005 — Page fitting avoids font-size changes by default

**Status:** Accepted

`정확히 N쪽` 계열 자동 맞춤은 먼저 문단 간격과 행간(density)을 조정하고, 부족할 때만 위아래 페이지 여백을 줄인다.

초기 자동화는 글자 크기·좌우 여백·이미지 크기를 임의로 바꾸지 않는다. 사용자가 읽기 어려운 결과를 눈치채지 못한 채 제출하는 일을 줄이기 위해서다.
