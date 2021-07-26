import TransformerRuntime from '../src'
import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'

const runtime = new TransformerRuntime()

const img = 'registry.product-os.io/transformer-product-os-source-to-image'
const version = '1.4.9'

const content = fs.readFileSync('github-integration-test/balena.yml').toString()

const contract = yaml.load(content)

async function main () {
  const result = await runtime.runTransformer(path.join(__dirname, 'in'), contract as any,
  {
    "id": "841f8bf0-175b-4f37-8b36-23c34baf4716",
    "data": {
      "platform": "linux/amd64",
      "inputFilter": {
        "type": "object",
        "required": [
          "type",
          "data"
        ],
        "properties": {
          "data": {
            "type": "object",
            "required": [
              "platforms"
            ],
            "properties": {
              "platforms": {
                "type": "object",
                "required": [
                  "linux/amd64"
                ]
              }
            }
          },
          "type": {
            "const": "service-source@1.0.0"
          },
          "version": {
            "pattern": "^[^+]*-"
          }
        }
      },
      "$transformer": {
        "merged": false,
        "baseSlug": "product-os-source-to-image",
        "mergeable": true,
        "finalVersion": true,
        "parentMerged": false,
        "artifactReady": "2021-07-07T09:49:42.135Z",
        "mergeConfirmed": true,
        "encryptedSecrets": {
          "buildSecrets": {
            "NPM_TOKEN": "WjdzolKFfsMp0xMxPOEpZizVEFPjKj6nwHzecYlVupHN13JT033Iz6FR4NgUUAkT7W6DHVM+pWPGCQi0hfd/KM5D5bdJLvLYNsTRAC7LUQancYIXy8Zt3BDR6JNeoRVCU8dGjnOX1wflcXgeP/4a9SMuuh5MD3lFzWuW8DYMKDcAchv9hNg5ZXp6ofwsA/QQ589fyrG7FtjozWRL/iBR9nsdh4lvWq3jZvJv1gl215HCMI+oeW6sP9VSBElq/QzH63Nscup+JbsEkTjIzh75s41Jhf0JwKT+1IL/Qcs7jTLwMZ4XEsHArSHD1imZtcj+FvPTebGpH2Tp8zEwVar0jQ=="
          }
        }
      },
      "requirements": {},
      "workerFilter": {
        "type": "object",
        "required": [
          "type"
        ],
        "properties": {
          "type": {
            "const": "transformer-worker@1.0.0"
          }
        }
      },
      "targetPlatform": "linux/amd64",
      "backflowMapping": [
        {
          "upstreamPath": {
            "$$formula": "CONCATENATE(\"data.platforms['\", this.downstream.data.platform, \"'].image\")"
          },
          "downstreamValue": {
            "$$formula": "CONCATENATE(this.downstream.slug, \":\", this.downstream.version)"
          }
        }
      ],
      "encryptedSecrets": {
        "buildSecrets": {
          "NPM_TOKEN": "WjdzolKFfsMp0xMxPOEpZizVEFPjKj6nwHzecYlVupHN13JT033Iz6FR4NgUUAkT7W6DHVM+pWPGCQi0hfd/KM5D5bdJLvLYNsTRAC7LUQancYIXy8Zt3BDR6JNeoRVCU8dGjnOX1wflcXgeP/4a9SMuuh5MD3lFzWuW8DYMKDcAchv9hNg5ZXp6ofwsA/QQ589fyrG7FtjozWRL/iBR9nsdh4lvWq3jZvJv1gl215HCMI+oeW6sP9VSBElq/QzH63Nscup+JbsEkTjIzh75s41Jhf0JwKT+1IL/Qcs7jTLwMZ4XEsHArSHD1imZtcj+FvPTebGpH2Tp8zEwVar0jQ=="
        }
      }
    },
    "loop": null,
    "name": "SourceCode to amd64 container image Transformer",
    "slug": "transformer-product-os-source-to-image",
    "tags": [],
    "type": "transformer@1.0.0",
    "links": {
      "has attached element": [
        {
          "id": "f650d46c-1deb-4d20-85e6-62a57f8a5e71",
          "data": {
            "actor": "e16ee97d-71e0-4a86-a5e2-ff8c5eb7dca5",
            "target": "841f8bf0-175b-4f37-8b36-23c34baf4716",
            "payload": [
              {
                "op": "replace",
                "path": "/data/$transformer/artifactReady",
                "value": "2021-07-07T09:49:42.135Z"
              }
            ],
            "timestamp": "2021-07-07T09:49:42.319Z"
          },
          "loop": null,
          "name": null,
          "slug": "update-61d005dd-3bbf-4c93-be67-5d9c0191f36f",
          "tags": [],
          "type": "update@1.0.0",
          "links": {},
          "active": true,
          "markers": [],
          "version": "1.0.0",
          "requires": [],
          "linked_at": {
            "is attached to": "2021-07-07T09:49:45.523Z"
          },
          "created_at": "2021-07-07T09:49:44.492Z",
          "updated_at": null,
          "capabilities": []
        },
        {
          "id": "cf00d423-6a29-4e21-9cff-b1bd0e7bd1ba",
          "data": {
            "actor": "e16ee97d-71e0-4a86-a5e2-ff8c5eb7dca5",
            "target": "841f8bf0-175b-4f37-8b36-23c34baf4716",
            "payload": [],
            "timestamp": "2021-07-07T09:49:34.261Z"
          },
          "loop": null,
          "name": "formula re-evaluation",
          "slug": "update-87aa224f-4d13-4fd3-aba5-7b3bdd869985",
          "tags": [],
          "type": "update@1.0.0",
          "links": {},
          "active": true,
          "markers": [],
          "version": "1.0.0",
          "requires": [],
          "linked_at": {
            "is attached to": "2021-07-07T09:49:38.980Z"
          },
          "created_at": "2021-07-07T09:49:38.495Z",
          "updated_at": null,
          "capabilities": []
        },
        {
          "id": "d9763744-670c-47f3-b11c-ca4a757116da",
          "data": {
            "actor": "e16ee97d-71e0-4a86-a5e2-ff8c5eb7dca5",
            "target": "841f8bf0-175b-4f37-8b36-23c34baf4716",
            "payload": [
              {
                "op": "replace",
                "path": "/data/$transformer/mergeConfirmed",
                "value": false
              },
              {
                "op": "replace",
                "path": "/data/$transformer/artifactReady",
                "value": false
              }
            ],
            "timestamp": "2021-07-07T09:49:03.113Z"
          },
          "loop": null,
          "name": null,
          "slug": "update-7774ca6e-82eb-4430-b55c-e90055439d80",
          "tags": [],
          "type": "update@1.0.0",
          "links": {},
          "active": true,
          "markers": [],
          "version": "1.0.0",
          "requires": [],
          "linked_at": {
            "is attached to": "2021-07-07T09:49:05.645Z"
          },
          "created_at": "2021-07-07T09:49:05.178Z",
          "updated_at": null,
          "capabilities": []
        },
        {
          "id": "8310f394-94c1-4b08-95b8-b015053f1661",
          "data": {
            "actor": "c0144404-5ecd-4af1-ae19-a55255ff778c",
            "target": "841f8bf0-175b-4f37-8b36-23c34baf4716",
            "payload": [],
            "timestamp": "2021-07-07T09:48:27.751Z"
          },
          "loop": null,
          "name": "formula re-evaluation",
          "slug": "update-fbf27245-b9e1-495a-b030-2b1326d08e2c",
          "tags": [],
          "type": "update@1.0.0",
          "links": {},
          "active": true,
          "markers": [],
          "version": "1.0.0",
          "requires": [],
          "linked_at": {
            "is attached to": "2021-07-07T09:48:28.428Z"
          },
          "created_at": "2021-07-07T09:48:28.353Z",
          "updated_at": null,
          "capabilities": []
        },
        {
          "id": "e8ab845d-0a84-4e56-949b-6d94ecb464f8",
          "data": {
            "actor": "c0144404-5ecd-4af1-ae19-a55255ff778c",
            "target": "841f8bf0-175b-4f37-8b36-23c34baf4716",
            "payload": [
              {
                "op": "replace",
                "path": "/data/$transformer/artifactReady",
                "value": "2021-07-07T09:42:28.580Z"
              }
            ],
            "timestamp": "2021-07-07T09:48:21.414Z"
          },
          "loop": null,
          "name": null,
          "slug": "update-5aed73c7-25f3-458f-9c32-aa67a4844c76",
          "tags": [],
          "type": "update@1.0.0",
          "links": {},
          "active": true,
          "markers": [],
          "version": "1.0.0",
          "requires": [],
          "linked_at": {
            "is attached to": "2021-07-07T09:48:26.175Z"
          },
          "created_at": "2021-07-07T09:48:26.104Z",
          "updated_at": null,
          "capabilities": []
        },
        {
          "id": "0d5154b4-0592-4c63-a3f3-30d7d8176493",
          "data": {
            "actor": "c0144404-5ecd-4af1-ae19-a55255ff778c",
            "target": "841f8bf0-175b-4f37-8b36-23c34baf4716",
            "payload": {
              "data": {
                "platform": "linux/amd64",
                "inputFilter": {
                  "type": "object",
                  "required": [
                    "type",
                    "data"
                  ],
                  "properties": {
                    "data": {
                      "type": "object",
                      "required": [
                        "platforms"
                      ],
                      "properties": {
                        "platforms": {
                          "type": "object",
                          "required": [
                            "linux/amd64"
                          ]
                        }
                      }
                    },
                    "type": {
                      "const": "service-source@1.0.0"
                    },
                    "version": {
                      "pattern": "^[^+]*-"
                    }
                  }
                },
                "$transformer": {
                  "merged": false,
                  "baseSlug": "product-os-source-to-image",
                  "mergeable": false,
                  "finalVersion": true,
                  "parentMerged": true,
                  "artifactReady": false,
                  "mergeConfirmed": false,
                  "encryptedSecrets": {
                    "buildSecrets": {
                      "NPM_TOKEN": "WjdzolKFfsMp0xMxPOEpZizVEFPjKj6nwHzecYlVupHN13JT033Iz6FR4NgUUAkT7W6DHVM+pWPGCQi0hfd/KM5D5bdJLvLYNsTRAC7LUQancYIXy8Zt3BDR6JNeoRVCU8dGjnOX1wflcXgeP/4a9SMuuh5MD3lFzWuW8DYMKDcAchv9hNg5ZXp6ofwsA/QQ589fyrG7FtjozWRL/iBR9nsdh4lvWq3jZvJv1gl215HCMI+oeW6sP9VSBElq/QzH63Nscup+JbsEkTjIzh75s41Jhf0JwKT+1IL/Qcs7jTLwMZ4XEsHArSHD1imZtcj+FvPTebGpH2Tp8zEwVar0jQ=="
                    }
                  }
                },
                "requirements": {},
                "workerFilter": {
                  "type": "object",
                  "required": [
                    "type"
                  ],
                  "properties": {
                    "type": {
                      "const": "transformer-worker@1.0.0"
                    }
                  }
                },
                "targetPlatform": "linux/amd64",
                "backflowMapping": [
                  {
                    "upstreamPath": {
                      "$$formula": "CONCATENATE(\"data.platforms['\", this.downstream.data.platform, \"'].image\")"
                    },
                    "downstreamValue": {
                      "$$formula": "CONCATENATE(this.downstream.slug, \":\", this.downstream.version)"
                    }
                  }
                ],
                "encryptedSecrets": {
                  "buildSecrets": {
                    "NPM_TOKEN": "WjdzolKFfsMp0xMxPOEpZizVEFPjKj6nwHzecYlVupHN13JT033Iz6FR4NgUUAkT7W6DHVM+pWPGCQi0hfd/KM5D5bdJLvLYNsTRAC7LUQancYIXy8Zt3BDR6JNeoRVCU8dGjnOX1wflcXgeP/4a9SMuuh5MD3lFzWuW8DYMKDcAchv9hNg5ZXp6ofwsA/QQ589fyrG7FtjozWRL/iBR9nsdh4lvWq3jZvJv1gl215HCMI+oeW6sP9VSBElq/QzH63Nscup+JbsEkTjIzh75s41Jhf0JwKT+1IL/Qcs7jTLwMZ4XEsHArSHD1imZtcj+FvPTebGpH2Tp8zEwVar0jQ=="
                  }
                }
              },
              "loop": null,
              "name": "SourceCode to amd64 container image Transformer",
              "slug": "transformer-product-os-source-to-image",
              "tags": [],
              "type": "transformer@1.0.0",
              "links": {
                "was merged as": [],
                "was built from": [],
                "was built into": [],
                "was merged from": []
              },
              "active": true,
              "markers": [],
              "version": "1.4.5",
              "requires": [],
              "linked_at": {
                "was built from": "2021-07-07T09:42:18.667Z",
                "is contained in": "2021-07-07T09:42:14.516Z",
                "was generated by": "2021-07-07T09:42:24.791Z",
                "has attached element": "2021-07-07T09:42:31.336Z"
              },
              "created_at": "2021-07-07T09:41:36.116Z",
              "updated_at": "2021-07-07T09:48:20.110Z",
              "capabilities": []
            },
            "timestamp": "2021-07-07T09:48:21.414Z"
          },
          "loop": null,
          "name": null,
          "slug": "create-d950fa29-3f50-4dea-b7df-ed9c8c974809",
          "tags": [],
          "type": "create@1.0.0",
          "links": {},
          "active": true,
          "markers": [],
          "version": "1.0.0",
          "requires": [],
          "linked_at": {
            "is attached to": "2021-07-07T09:48:23.441Z"
          },
          "created_at": "2021-07-07T09:48:23.376Z",
          "updated_at": null,
          "capabilities": []
        }
      ]
    },
    "active": true,
    "markers": [],
    "version": "1.4.5",
    "requires": [],
    "linked_at": {
      "generated": "2021-07-22T09:23:09.892Z",
      "was built from": "2021-07-07T09:49:33.673Z",
      "is contained in": "2021-07-07T09:49:29.670Z",
      "was merged from": "2021-07-07T09:48:27.549Z",
      "was generated by": "2021-07-07T09:49:38.980Z",
      "has attached element": "2021-07-07T09:49:45.523Z"
    },
    "created_at": "2021-07-07T09:48:21.653Z",
    "updated_at": "2021-07-07T09:49:43.143Z",
    "capabilities": []
  }, `${img}:${version}`, path.join(__dirname, '..', 'github-integration-test'), path.join(__dirname, 'out'), true)
  console.log(result)
}

main()
