// AUTO-GENERATED from accepted v1.1 tool pack; deterministic.
export const OPERATION_CATALOG = Object.freeze([
  {
    "id": "tool_sam_superbash",
    "name": "sam.superbash",
    "description": "sam.superbash: use the authorized authorized_execution_lane domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "script": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200000
        },
        "scriptArtifactRef": {
          "type": "string",
          "minLength": 1
        },
        "relativeCwd": {
          "type": "string"
        },
        "idempotencyKey": {
          "type": "string"
        }
      },
      "required": [],
      "additionalProperties": false,
      "oneOf": [
        {
          "required": [
            "script"
          ],
          "not": {
            "required": [
              "scriptArtifactRef"
            ]
          }
        },
        {
          "required": [
            "scriptArtifactRef"
          ],
          "not": {
            "required": [
              "script"
            ]
          }
        }
      ]
    },
    "output_schema": null,
    "capability_key": "terminal.shell.execute",
    "handler_ref": "sam.superbash",
    "policy": {
      "name": "sam.superbash",
      "pack": "sam",
      "effect": "shell_execution",
      "target_scope": "authorized_execution_lane",
      "authorization": "execution_grant",
      "recovery_requirement": "process_receipt",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_sam_script_save",
    "name": "sam.script.save",
    "description": "sam.script.save: use the authorized owned_script_library domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "script": {
          "type": "string"
        },
        "scriptId": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        },
        "description": {
          "type": "string"
        }
      },
      "required": [
        "script"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "terminal.script.write",
    "handler_ref": "sam.script.save",
    "policy": {
      "name": "sam.script.save",
      "pack": "sam",
      "effect": "script_artifact_write",
      "target_scope": "owned_script_library",
      "authorization": "script_write_permission",
      "recovery_requirement": "versioned_artifact",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_sam_script_get",
    "name": "sam.script.get",
    "description": "sam.script.get: use the authorized owned_script_library domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "scriptId": {
          "type": "string"
        },
        "version": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "scriptId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "terminal.script.read",
    "handler_ref": "sam.script.get",
    "policy": {
      "name": "sam.script.get",
      "pack": "sam",
      "effect": "read",
      "target_scope": "owned_script_library",
      "authorization": "script_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_definition_list",
    "name": "cms.definition.list",
    "description": "cms.definition.list: use the authorized merchant_catalog domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string"
        },
        "status": {
          "type": "string"
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.definition.read",
    "handler_ref": "cms.definition.list",
    "policy": {
      "name": "cms.definition.list",
      "pack": "cms",
      "effect": "read",
      "target_scope": "merchant_catalog",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_page_inspect",
    "name": "cms.page.inspect",
    "description": "cms.page.inspect: use the authorized merchant_page domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string"
        }
      },
      "required": [
        "pageId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.page.read",
    "handler_ref": "cms.page.inspect",
    "policy": {
      "name": "cms.page.inspect",
      "pack": "cms",
      "effect": "read",
      "target_scope": "merchant_page",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_page_createDraft",
    "name": "cms.page.createDraft",
    "description": "cms.page.createDraft: use the authorized merchant_page domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "templateKey": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "path": {
          "type": "string"
        }
      },
      "required": [
        "templateKey",
        "title",
        "path"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.page.write",
    "handler_ref": "cms.page.createDraft",
    "policy": {
      "name": "cms.page.createDraft",
      "pack": "cms",
      "effect": "draft_create",
      "target_scope": "merchant_page",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_inspect",
    "name": "cms.section.inspect",
    "description": "cms.section.inspect: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string"
        },
        "sectionId": {
          "type": "string"
        }
      },
      "required": [
        "pageId",
        "sectionId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.read",
    "handler_ref": "cms.section.inspect",
    "policy": {
      "name": "cms.section.inspect",
      "pack": "cms",
      "effect": "read",
      "target_scope": "merchant_section",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_create",
    "name": "cms.section.create",
    "description": "cms.section.create: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string"
        },
        "definitionKey": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "pageId",
        "definitionKey",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.write",
    "handler_ref": "cms.section.create",
    "policy": {
      "name": "cms.section.create",
      "pack": "cms",
      "effect": "draft_create",
      "target_scope": "merchant_section",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_updateDraft",
    "name": "cms.section.updateDraft",
    "description": "cms.section.updateDraft: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sectionId": {
          "type": "string"
        },
        "settings": {
          "type": "object"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "sectionId",
        "settings",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.write",
    "handler_ref": "cms.section.updateDraft",
    "policy": {
      "name": "cms.section.updateDraft",
      "pack": "cms",
      "effect": "draft_update",
      "target_scope": "merchant_section",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_duplicate",
    "name": "cms.section.duplicate",
    "description": "cms.section.duplicate: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sectionId": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "sectionId",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.write",
    "handler_ref": "cms.section.duplicate",
    "policy": {
      "name": "cms.section.duplicate",
      "pack": "cms",
      "effect": "draft_create",
      "target_scope": "merchant_section",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_move",
    "name": "cms.section.move",
    "description": "cms.section.move: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sectionId": {
          "type": "string"
        },
        "targetIndex": {
          "type": "integer",
          "minimum": 0
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "sectionId",
        "targetIndex",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.write",
    "handler_ref": "cms.section.move",
    "policy": {
      "name": "cms.section.move",
      "pack": "cms",
      "effect": "draft_reorder",
      "target_scope": "merchant_section",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_visibility",
    "name": "cms.section.visibility",
    "description": "cms.section.visibility: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sectionId": {
          "type": "string"
        },
        "visible": {
          "type": "boolean"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "sectionId",
        "visible",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.write",
    "handler_ref": "cms.section.visibility",
    "policy": {
      "name": "cms.section.visibility",
      "pack": "cms",
      "effect": "draft_visibility",
      "target_scope": "merchant_section",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_section_remove",
    "name": "cms.section.remove",
    "description": "cms.section.remove: use the authorized merchant_section domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sectionId": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "sectionId",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.section.write",
    "handler_ref": "cms.section.remove",
    "policy": {
      "name": "cms.section.remove",
      "pack": "cms",
      "effect": "draft_soft_remove",
      "target_scope": "merchant_section",
      "authorization": "draft_write_permission",
      "recovery_requirement": "recovery_required",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_block_add",
    "name": "cms.block.add",
    "description": "cms.block.add: use the authorized merchant_block domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sectionId": {
          "type": "string"
        },
        "definitionKey": {
          "type": "string"
        },
        "parentBlockId": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "sectionId",
        "definitionKey",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.block.write",
    "handler_ref": "cms.block.add",
    "policy": {
      "name": "cms.block.add",
      "pack": "cms",
      "effect": "draft_create",
      "target_scope": "merchant_block",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_block_update",
    "name": "cms.block.update",
    "description": "cms.block.update: use the authorized merchant_block domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "blockId": {
          "type": "string"
        },
        "settings": {
          "type": "object"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "blockId",
        "settings",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.block.write",
    "handler_ref": "cms.block.update",
    "policy": {
      "name": "cms.block.update",
      "pack": "cms",
      "effect": "draft_update",
      "target_scope": "merchant_block",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_block_move",
    "name": "cms.block.move",
    "description": "cms.block.move: use the authorized merchant_block domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "blockId": {
          "type": "string"
        },
        "targetIndex": {
          "type": "integer",
          "minimum": 0
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "blockId",
        "targetIndex",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.block.write",
    "handler_ref": "cms.block.move",
    "policy": {
      "name": "cms.block.move",
      "pack": "cms",
      "effect": "draft_reorder",
      "target_scope": "merchant_block",
      "authorization": "draft_write_permission",
      "recovery_requirement": "revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_block_remove",
    "name": "cms.block.remove",
    "description": "cms.block.remove: use the authorized merchant_block domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "blockId": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "blockId",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.block.write",
    "handler_ref": "cms.block.remove",
    "policy": {
      "name": "cms.block.remove",
      "pack": "cms",
      "effect": "draft_destructive_remove",
      "target_scope": "merchant_block",
      "authorization": "draft_remove_permission_and_recovery_check",
      "recovery_requirement": "revision_restore_must_be_proven",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cms_page_publish",
    "name": "cms.page.publish",
    "description": "cms.page.publish: use the authorized merchant_page domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string"
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "pageId",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cms.page.publish",
    "handler_ref": "cms.page.publish",
    "policy": {
      "name": "cms.page.publish",
      "pack": "cms",
      "effect": "live_publish",
      "target_scope": "merchant_page",
      "authorization": "publish_permission_and_explicit_intent",
      "recovery_requirement": "published_revision",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_asset_inspect",
    "name": "media.asset.inspect",
    "description": "media.asset.inspect: use the authorized merchant_media domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.asset.read",
    "handler_ref": "media.asset.inspect",
    "policy": {
      "name": "media.asset.inspect",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_media",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_asset_upload",
    "name": "media.asset.upload",
    "description": "media.asset.upload: use the authorized merchant_media domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "sourceArtifactRef": {
          "type": "string"
        },
        "filename": {
          "type": "string"
        },
        "contentType": {
          "type": "string"
        }
      },
      "required": [
        "sourceArtifactRef",
        "filename"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.asset.write",
    "handler_ref": "media.asset.upload",
    "policy": {
      "name": "media.asset.upload",
      "pack": "media",
      "effect": "media_asset_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_asset_retained",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_asset_prepare",
    "name": "media.asset.prepare",
    "description": "media.asset.prepare: use the authorized merchant_media domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "operations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "kind": {
                "type": "string",
                "enum": [
                  "optimize",
                  "resize",
                  "crop",
                  "convert",
                  "trim_alpha",
                  "normalize_color"
                ]
              },
              "width": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20000
              },
              "height": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20000
              },
              "left": {
                "type": "integer",
                "minimum": 0
              },
              "top": {
                "type": "integer",
                "minimum": 0
              },
              "format": {
                "type": "string",
                "enum": [
                  "png",
                  "jpeg",
                  "webp"
                ]
              },
              "quality": {
                "type": "integer",
                "minimum": 1,
                "maximum": 100
              },
              "fit": {
                "type": "string",
                "enum": [
                  "inside",
                  "cover",
                  "contain",
                  "fill"
                ]
              },
              "allowUpscale": {
                "type": "boolean"
              }
            },
            "required": [
              "kind"
            ],
            "additionalProperties": false
          },
          "minItems": 1
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        },
        "idempotencyKey": {
          "type": "string"
        }
      },
      "required": [
        "assetId",
        "operations",
        "expectedVersion"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.asset.write",
    "handler_ref": "media.asset.prepare",
    "policy": {
      "name": "media.asset.prepare",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_asset_retained",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_asset_job_status",
    "name": "media.asset.job.status",
    "description": "media.asset.job.status: use the authorized merchant_media_job domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "jobId": {
          "type": "string"
        }
      },
      "required": [
        "jobId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.asset.read",
    "handler_ref": "media.asset.job.status",
    "policy": {
      "name": "media.asset.job.status",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_media_job",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_asset_background_remove",
    "name": "media.asset.background.remove",
    "description": "Deprecated alias of media.image.background.remove; do not advertise as a separate model tool.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        },
        "method": {
          "type": "string"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.asset.write",
    "handler_ref": "media.asset.background.remove",
    "policy": {
      "name": "media.asset.background.remove",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_asset_retained",
      "actor_identity": "host_authenticated_context_only"
    },
    "aliasFor": "media.image.background.remove"
  },
  {
    "id": "tool_media_asset_versions_list",
    "name": "media.asset.versions.list",
    "description": "media.asset.versions.list: use the authorized merchant_media domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.asset.read",
    "handler_ref": "media.asset.versions.list",
    "policy": {
      "name": "media.asset.versions.list",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_media",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_model_inspect",
    "name": "media.model.inspect",
    "description": "media.model.inspect: use the authorized merchant_model domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.model.read",
    "handler_ref": "media.model.inspect",
    "policy": {
      "name": "media.model.inspect",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_model",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_model_validate",
    "name": "media.model.validate",
    "description": "media.model.validate: use the authorized merchant_model domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.model.read",
    "handler_ref": "media.model.validate",
    "policy": {
      "name": "media.model.validate",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_model",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_model_optimize",
    "name": "media.model.optimize",
    "description": "media.model.optimize: use the authorized merchant_model domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        },
        "profile": {
          "type": "string",
          "enum": [
            "web",
            "mobile",
            "original_preserving"
          ]
        },
        "expectedVersion": {
          "type": "integer",
          "minimum": 1
        }
      },
      "required": [
        "assetId",
        "profile"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.model.write",
    "handler_ref": "media.model.optimize",
    "policy": {
      "name": "media.model.optimize",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_model",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_asset_retained",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_product_artwork_preflight",
    "name": "product.artwork.preflight",
    "description": "product.artwork.preflight: use the authorized merchant_product_artwork domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string"
        },
        "productId": {
          "type": "string"
        },
        "placement": {
          "type": "string"
        }
      },
      "required": [
        "assetId",
        "productId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "commerce.product.read",
    "handler_ref": "product.artwork.preflight",
    "policy": {
      "name": "product.artwork.preflight",
      "pack": "product",
      "effect": "read",
      "target_scope": "merchant_product_artwork",
      "authorization": "resource_read_permission",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cloudflare_r2_buckets_list",
    "name": "cloudflare.r2.buckets.list",
    "description": "cloudflare.r2.buckets.list: use the authorized authorized_cloudflare_connection domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "connectionRef": {
          "type": "string"
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cloudflare.resources.read",
    "handler_ref": "cloudflare.r2.buckets.list",
    "policy": {
      "name": "cloudflare.r2.buckets.list",
      "pack": "cloudflare",
      "effect": "platform_read",
      "target_scope": "authorized_cloudflare_connection",
      "authorization": "operator_platform_read",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_cloudflare_r2_objects_inventory",
    "name": "cloudflare.r2.objects.inventory",
    "description": "cloudflare.r2.objects.inventory: use the authorized authorized_r2_bucket domain service; validate source versions, resource ownership and results.",
    "input_schema": {
      "type": "object",
      "properties": {
        "bucketRef": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "cursor": {
          "type": "string"
        },
        "pageSize": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000
        }
      },
      "required": [
        "bucketRef"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "cloudflare.r2.objects.read",
    "handler_ref": "cloudflare.r2.objects.inventory",
    "policy": {
      "name": "cloudflare.r2.objects.inventory",
      "pack": "cloudflare",
      "effect": "platform_read",
      "target_scope": "authorized_r2_bucket",
      "authorization": "operator_or_delegated_bucket_read",
      "recovery_requirement": "none",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_background_remove",
    "name": "media.image.background.remove",
    "description": "Remove a connected flat background or use an installed subject segmenter; preserve original pixels and create a PNG derivative.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "method": {
          "type": "string",
          "enum": [
            "flat_connected",
            "subject_ai"
          ]
        },
        "tolerance": {
          "type": "integer",
          "minimum": 0,
          "maximum": 255
        },
        "idempotencyKey": {
          "type": "string"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.background.remove",
    "policy": {
      "name": "media.image.background.remove",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_generate",
    "name": "media.image.generate",
    "description": "Generate reviewable image drafts via installed authorized image provider; do not auto-promote generated output.",
    "input_schema": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "minLength": 1
        },
        "model": {
          "type": "string"
        },
        "size": {
          "type": "string"
        },
        "variations": {
          "type": "integer",
          "minimum": 1,
          "maximum": 8
        }
      },
      "required": [
        "prompt"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.generate",
    "handler_ref": "media.image.generate",
    "policy": {
      "name": "media.image.generate",
      "pack": "media",
      "effect": "media_draft_create",
      "target_scope": "merchant_media",
      "authorization": "image_generation_permission",
      "recovery_requirement": "receipt",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_edit",
    "name": "media.image.edit",
    "description": "Edit a previously owned image reference via the authorized provider, returning a draft and source lineage.",
    "input_schema": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "minLength": 1
        },
        "sourceArtifactRef": {
          "type": "string",
          "minLength": 1
        },
        "model": {
          "type": "string"
        },
        "size": {
          "type": "string"
        }
      },
      "required": [
        "prompt",
        "sourceArtifactRef"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.edit",
    "handler_ref": "media.image.edit",
    "policy": {
      "name": "media.image.edit",
      "pack": "media",
      "effect": "media_draft_create",
      "target_scope": "merchant_media",
      "authorization": "image_generation_permission",
      "recovery_requirement": "receipt",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_inspect",
    "name": "media.image.inspect",
    "description": "Inspect owned raster image dimensions, format and alpha properties.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.read",
    "handler_ref": "media.image.inspect",
    "policy": {
      "name": "media.image.inspect",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_media",
      "authorization": "resource_read_permission",
      "recovery_requirement": "receipt",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_optimize",
    "name": "media.image.optimize",
    "description": "Create an immutable optimize image derivative using the installed image processor, retaining the original and provenance.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.optimize",
    "policy": {
      "name": "media.image.optimize",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_resize",
    "name": "media.image.resize",
    "description": "Create an immutable resize image derivative using the installed image processor, retaining the original and provenance.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "width": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20000
        },
        "height": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20000
        },
        "fit": {
          "type": "string",
          "enum": [
            "inside",
            "cover",
            "contain",
            "fill"
          ]
        },
        "allowUpscale": {
          "type": "boolean"
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.resize",
    "policy": {
      "name": "media.image.resize",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_crop",
    "name": "media.image.crop",
    "description": "Create an immutable crop image derivative using the installed image processor, retaining the original and provenance.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "left": {
          "type": "integer",
          "minimum": 0
        },
        "top": {
          "type": "integer",
          "minimum": 0
        },
        "width": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20000
        },
        "height": {
          "type": "integer",
          "minimum": 1,
          "maximum": 20000
        }
      },
      "required": [
        "assetId",
        "left",
        "top",
        "width",
        "height"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.crop",
    "policy": {
      "name": "media.image.crop",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_convert",
    "name": "media.image.convert",
    "description": "Create an immutable convert image derivative using the installed image processor, retaining the original and provenance.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.convert",
    "policy": {
      "name": "media.image.convert",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_trim_alpha",
    "name": "media.image.trim_alpha",
    "description": "Create an immutable trim_alpha image derivative using the installed image processor, retaining the original and provenance.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.trim_alpha",
    "policy": {
      "name": "media.image.trim_alpha",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_image_normalize_color",
    "name": "media.image.normalize_color",
    "description": "Create an immutable normalize_color image derivative using the installed image processor, retaining the original and provenance.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        },
        "format": {
          "type": "string",
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.image.write",
    "handler_ref": "media.image.normalize_color",
    "policy": {
      "name": "media.image.normalize_color",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_media",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_model_validateStructural",
    "name": "media.model.validateStructural",
    "description": "Inspect a GLB container header, embedded JSON and basic structural counts; not a Khronos conformance check.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.model.read",
    "handler_ref": "media.model.validateStructural",
    "policy": {
      "name": "media.model.validateStructural",
      "pack": "media",
      "effect": "read",
      "target_scope": "merchant_model",
      "authorization": "resource_read_permission",
      "recovery_requirement": "receipt",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_artwork_normalize",
    "name": "media.artwork.normalize",
    "description": "Use an authorized agentsam-merch raster normalization implementation to prepare artwork as a versioned derivative.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "profile": {
          "type": "string",
          "minLength": 1
        },
        "idempotencyKey": {
          "type": "string"
        }
      },
      "required": [
        "assetId",
        "profile"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.artwork.write",
    "handler_ref": "media.artwork.normalize",
    "policy": {
      "name": "media.artwork.normalize",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_artwork",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_artwork_vector_trace",
    "name": "media.artwork.vector.trace",
    "description": "Trace raster artwork to SVG using a verified tracing runtime; preserve original and evaluate quality.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        },
        "profile": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.artwork.write",
    "handler_ref": "media.artwork.vector.trace",
    "policy": {
      "name": "media.artwork.vector.trace",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_artwork",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  },
  {
    "id": "tool_media_artwork_svg_normalize",
    "name": "media.artwork.svg.normalize",
    "description": "Normalize authored SVG via an installed vetted SVG implementation; store a derivative.",
    "input_schema": {
      "type": "object",
      "properties": {
        "assetId": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "assetId"
      ],
      "additionalProperties": false
    },
    "output_schema": null,
    "capability_key": "media.artwork.write",
    "handler_ref": "media.artwork.svg.normalize",
    "policy": {
      "name": "media.artwork.svg.normalize",
      "pack": "media",
      "effect": "media_derivative_create",
      "target_scope": "merchant_artwork",
      "authorization": "media_write_permission",
      "recovery_requirement": "original_and_derivative",
      "actor_identity": "host_authenticated_context_only"
    }
  }
]);
