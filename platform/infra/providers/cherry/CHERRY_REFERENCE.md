# Cherry Servers Reference

## API Queries

```bash
export CHERRY_AUTH_TOKEN="<token>"

# Regions
curl -s -H "Authorization: Bearer ${CHERRY_AUTH_TOKEN}" "https://api.cherryservers.com/v1/regions" | jq '.[] | {slug, location}'

# Plans
curl -s -H "Authorization: Bearer ${CHERRY_AUTH_TOKEN}" "https://api.cherryservers.com/v1/plans" | jq '.[] | {slug, name: .specs.memory.name}'

# Plans for region (e.g., Frankfurt = region_id 6)
curl -s -H "Authorization: Bearer ${CHERRY_AUTH_TOKEN}" "https://api.cherryservers.com/v1/plans?region_id=6" | jq '.[].slug'

# Project servers
curl -s -H "Authorization: Bearer ${CHERRY_AUTH_TOKEN}" "https://api.cherryservers.com/v1/projects/${CHERRY_PROJECT_ID}/servers" | jq '.[] | {hostname, region, plan: .plan.slug}'
```

## Regions

| ID  | Slug           | Location    |
| --- | -------------- | ----------- |
| 1   | `LT-Siauliai`  | Lithuania   |
| 2   | `NL-Amsterdam` | Netherlands |
| 3   | `US-Chicago`   | USA         |
| 4   | `SG-Singapore` | Singapore   |
| 5   | `SE-Stockholm` | Sweden      |
| 6   | `DE-Frankfurt` | Germany     |

## Cloud VPS Plans

| Slug                   | Specs                   | EUR/hr |
| ---------------------- | ----------------------- | ------ |
| `B1-1-1gb-20s-shared`  | 1 vCore, 1GB, 20GB SSD  | €0.018 |
| `B1-2-2gb-40s-shared`  | 2 vCore, 2GB, 40GB SSD  | -      |
| `B1-4-4gb-80s-shared`  | 4 vCore, 4GB, 80GB SSD  | -      |
| `B1-6-6gb-100s-shared` | 6 vCore, 6GB, 100GB SSD | -      |
