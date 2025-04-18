#!/bin/bash
# 이 스크립트는 Git 이력에서 민감한 데이터(.env 파일)를 제거합니다.
# 주의: 이 스크립트를 실행하면 Git 이력이 재작성됩니다.
# 팀 프로젝트인 경우 모든 팀원에게 알리고 동기화해야 합니다.

echo "경고: 이 스크립트는 Git 이력을 재작성합니다."
echo "계속하시겠습니까? (y/n)"
read -r confirm

if [ "$confirm" != "y" ]; then
    echo "스크립트를 중단합니다."
    exit 1
fi

echo "Git 이력에서 .env 파일을 제거합니다..."
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

echo "Git 레포지토리 정리 중..."
git reflog expire --expire=now --all
git gc --aggressive --prune=now

echo "완료되었습니다."
echo "이제 강제로 푸시해야 합니다: git push -f origin main"
echo "주의: 다른 브랜치도 업데이트해야 할 수 있습니다." 