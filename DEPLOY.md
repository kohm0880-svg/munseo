# Deploy

## GitHub

새 저장소를 만든 뒤 이 디렉터리 전체를 `main`에 push합니다.

```bash
git init -b main
git add .
git commit -m "chore: bootstrap future-proof editor architecture"
git remote add origin <REPOSITORY_URL>
git push -u origin main
```

## Render

이 저장소 루트에 `render.yaml`이 있으므로 Render Blueprint 또는 Static Site에서 연결할 수 있습니다.

배포 계약은 단순합니다.

```text
build:   npm ci && npm run check
publish: ./dist
```

앱 자체에는 Render SDK나 Render 전용 런타임 코드가 없습니다. 다른 정적 호스팅으로 옮길 때도 `dist/`를 배포하면 됩니다.

## 로컬 검증

```bash
npm ci
npm run check
```

`check`는 테스트, 빌드, 배포 산출물 smoke check를 순서대로 실행합니다.
