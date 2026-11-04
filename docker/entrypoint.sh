#!/bin/sh
set -eu

# 纯净版镜像：只迁移结构，不写入演示账号或演示数据。
# 首次访问 http://<host>:<port>/install 创建超级管理员。
node apps/server/dist/migrate.mjs

exec node apps/server/dist/index.mjs
