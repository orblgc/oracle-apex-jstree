function initMyJsTree(
    regionstaticid,
    containerSelector,
    ajaxId,
    searchItem,
    initItems,
    ajaxItems,
    dropItems,
    useAjax,
    useDrop,
    configJson,
    drop_success_message,
    drop_error_message
    
) {
    var $ = apex.jQuery;
    var tree$ = $('#' + containerSelector);

    // Parse config JSON
    var config = {};
    try {
        config = eval('(' + configJson + ')');
        //config = JSON.parse(configJson);
    } catch (e) {
        console.error('Invalid config JSON:', configJson);
    }

    var selectionMap = config.selectionMap || [];

    // jsTree config
    var jsTreeConfig = {
        core: {
            "worker": false,
            "check_callback": true,
            "themes": {
                "name": "proton",
                "dots": true,
                "icons": true
            },
            "force_text": true,
            "multiple": false,
            "dblclick_toggle": false
        },
        plugins: []
    };

    // … jsTree config hazırlanırken …
    if (config.contextMenu) {
        jsTreeConfig.plugins.push('contextmenu');
        jsTreeConfig.contextmenu = {
            items: function(node) {
                var tree     = this;
                var type     = node.original.type;
                var menuDef  = config.contextMenu[type] || [];
                var items    = {};

                menuDef.forEach(function(m, idx) {
                    var fnName = m.callback;
                    items[fnName || ('action_' + idx)] = {
                        label: typeof m.label === 'function' ? m.label() : m.label,
                        icon:  m.icon || false,
                        separator_before: m.separator_before || false,
                        separator_after:  m.separator_after || false,
                        _disabled: m._disabled || false,
                        title: m.title || '',
                        shortcut: m.shortcut || undefined,
                        shortcut_label: m.shortcut_label || undefined,
                        submenu: m.submenu || undefined,
                        action: function(obj) {
                            var nd = m.returnAllSelected===true?tree.get_selected():tree.get_node(obj.reference);
                            if (fnName && typeof window[fnName] === 'function') {
                                window[fnName](nd);
                            } else {
                                console.warn('Callback for', fnName, 'not found');
                            }
                        }
                    };
                });

                return items;
            }
        };

    }

    if (typeof config.force_text === 'boolean') {
        jsTreeConfig.core.force_text = config.force_text;
    }
    if (typeof config.multiple === 'boolean') {
        jsTreeConfig.core.multiple = config.multiple;
    }
    if (typeof config.dblclick_toggle === 'boolean') {
        jsTreeConfig.core.dblclick_toggle = config.dblclick_toggle;
    }
    // Determine data loading strategy
    jsTreeConfig.core.data = function (node, cb) {
        var isInitial = node.id === '#';
        if (useAjax != 'Y' && !isInitial) {
            cb([]); // No child loading
            return;
        }

        var datatype = node["li_attr"]?.["data-type"];
        var handler = isInitial ? 'INITIAL' : 'LOAD';
        var payload = {
            x01: node.id,
            x02: handler,
            x03: datatype
        };
        if ((isInitial && initItems) || (!isInitial && ajaxItems)) {
            payload.pageItems = (isInitial ? initItems : ajaxItems)
                .split(",")
                .map(item => "#" + item.trim())
                .join(",");
        }

        apex.server.plugin(
            ajaxId,
            payload,
            {
                dataType: 'json',
                success: function (data) {
                var rows = data.row || [];
                var nodes = rows.map(function (r) {
                    return {
                    id: r.NODE_ID,
                    parent: r.PARENT_ID,
                    text: r.TEXT,
                    icon: r.ICON,
                    type: r.TYPE,
                    state: {
                        opened: r.STATE_OPENED == 1,
                        selected: r.STATE_SELECTED == 1,
                        disabled: r.STATE_DISABLED == 1
                    },
                    li_attr: {
                        'data-type': r.TYPE,
                        'data-value': r.VALUE
                    },
                    a_attr: {
                        'data-href': r.HREF
                    },
                    checkbox: r.CHECKBOX == 1,
                    unselectable: r.UNSELECTABLE == 1
                    };
                });

                cb(nodes); // jsTree callback
                }
            }
        );
    };

    // Search plugin
    if (searchItem) {
        jsTreeConfig.plugins.push('search');
        jsTreeConfig.search = {
            show_only_matches: true,
            show_only_matches_children: true
        };
    }

    // Checkbox plugin
    if (config.enableCheckbox) {
        jsTreeConfig.plugins.push('checkbox');
        jsTreeConfig.checkbox = {
            cascade: config.checkboxCascade || 'down',
            three_state: config.threeState !== false,
            cascade_to_hidden: config.cascade_to_hidden || false
        };
    }

    // DnD plugin
    var mobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent)
    if (useDrop === 'Y' && (mobile && config.dndAllowMobile || !mobile)) {
        jsTreeConfig.plugins.push('dnd');

        // Eğer ek dnd kuralları varsa üzerine ekle
        if (config.dndRules) {
            jsTreeConfig.core.dnd = {check_while_dragging : true};
        }
    }
    
    jsTreeConfig.core.check_callback = function (operation, node, parent, position, more) {
        // Only handle 'move_node' operations if DnD rules are provided
        if (operation === "move_node" && config.dndRules) {
            try {
                var fromType = node.li_attr?.["data-type"];
                var toType = parent.li_attr?.["data-type"];
                // Fallback for target type (e.g., when moving to root)
                if (!toType && parent.id === "#") {
                    toType = "#";
                }

                // Allow everything if types are missing
                if (!fromType || !toType) {
                    return true;
                }

                var allowedTargets = config.dndRules[fromType];
                if (Array.isArray(allowedTargets)) {
                    return allowedTargets.includes(toType);
                } else {
                    return true; // No specific rule for this type, allow by default
                }
            } catch (e) {
                console.error("DnD check failed:", e);
                return true; // fallback: allow
            }
        }

        return true; // allow all other operations by default
    };

    // Init tree
    tree$.jstree(jsTreeConfig);

    if(config.nodeLinkOpenOn === 'dblclick'){
        var tapped=false
        var target;
        tree$.on('click.jstree', function (e) {
            if(!tapped){ //if tap is not set, set up single tap
                target = e.target;
                tapped=setTimeout(function(){
                    tapped=null
                    //insert things you want to do when single tapped
                },300);   //wait 300ms then run single click code
            } else if(target == e.target) {    //tapped within 300ms of last tap. double tap
                clearTimeout(tapped); //stop single tap callback
                tapped=null
                const $a = $(e.target).closest('a');
                const href = $a.data('href');
                if (href) {
                    if($a.data('target') == '_blank'){
                        apex.navigation.openInNewWindow(href);
                    } else{
                        apex.navigation.redirect(href)
                    }
                }
            }
            e.preventDefault()
            
        });
    } else{
        tree$.on('activate_node.jstree', function (e, data) {
            const href = data.node.a_attr["data-href"];
            if (href) {
                if(data.node.a_attr["data-target"] == '_blank'){
                    apex.navigation.openInNewWindow(href);
                } else{
                    apex.navigation.redirect(href)
                }
            }
        });
    }

    //tree$.jstree("set_theme","default-dark");
    // Update page items on selection change
    function updateSelections() {
        var selectedByType = {};
        tree$
            .jstree(true)
            .get_selected()
            .forEach(function (nodeId) {
                var node = tree$.jstree(true).get_node(nodeId);
                var type = node.li_attr['data-type'];
                var value = node.li_attr['data-value'];
                if (type && value) {
                    selectedByType[type] = selectedByType[type] || [];
                    selectedByType[type].push(value);
                }
            });
        selectionMap.forEach(function (map) {
            var ids = selectedByType[map.type] || [];
            apex.item(map.itemName).setValue(ids.join(':'));
        });
    }

    tree$.on('changed.jstree', updateSelections);
    tree$.on('open_node.jstree', function () {
        setTimeout(updateSelections, 0);
    });
    
    // Drag & Drop handler
    if (useDrop === 'Y') {
        tree$.on('move_node.jstree', function (e, data) {
            var parentNode = data.instance.get_node(data.parent); // Parent node'u al
            var parentValue = parentNode?.li_attr?.["data-value"] || null; // data-value'yu al
            var parentNodeType = parentNode?.li_attr?.['data-type']|| null;

            var oldParentNode = data.instance.get_node(data.old_parent); // Parent node'u al
            var oldParentValue = oldParentNode?.li_attr?.["data-value"] || null; // data-value'yu al
            var oldParentNodeType = oldParentNode?.li_attr?.['data-type']|| null;

            var nodeId = data.node?.li_attr?.["data-value"] || null;
            var nodeType = data.node?.li_attr?.['data-type']||null;


            var payload = {
                x01: nodeId,
                x02: 'ON_DROP',
                x03: oldParentValue,
                x04: parentValue,
                x05: data.old_position,
                x06: data.position,
                x07: oldParentNodeType,
                x08: parentNodeType,
                x09: nodeType
            };

            if (dropItems) {
                payload.pageItems = dropItems
                    .split(",")
                    .map(item => "#" + item.trim())
                    .join(",");
            }
            apex.server.plugin(
                ajaxId,
                payload,
                {
                    dataType: 'json',
                    success: function (res) {
                        apex.message.clearErrors();
                        if (!res.success) {
                            if(drop_error_message){
                                apex.message.showErrors( [
                                    {
                                        type:       "error",
                                        location:   [ "page", "inline" ],
                                        message:    drop_error_message,
                                        unsafe:     false
                                    }
                                ] );
                            }
                            
                            /* data.instance.move_node(
                                data.node,
                                data.old_parent,
                                data.old_position
                            ); */
                        } else if(drop_success_message){
                            apex.message.showPageSuccess(drop_success_message)
                        }
                    }
                }
            );
        });
    }

    // Search field
    if (searchItem) {
        $('#' + searchItem).on('keydown', function (e) {
            if (e.key === 'Enter') {
                tree$.jstree(true).search(this.value);
            }
        });
    }
    $('#' + regionstaticid).on("apexrefresh", function () {
        tree$.jstree().refresh({ "skip_loading": config.skip_loading || false });
    });
}
