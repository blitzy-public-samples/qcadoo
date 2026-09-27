/*
 * ***************************************************************************
 * Copyright (c) 2010 Qcadoo Limited
 * Project: Qcadoo Framework
 * Version: 1.4
 *
 * This file is part of Qcadoo.
 *
 * Qcadoo is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation; either version 3 of the License,
 * or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty
 * of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 * ***************************************************************************
 */
var QCD = QCD || {};
QCD.components = QCD.components || {};
QCD.components.elements = QCD.components.elements || {};

/** Stateless Gantt move calculations on "yyyy-MM-dd HH:mm:ss" wall-clock dates and minutes since 1970-01-01 00:00:00. */
QCD.components.elements.GanttChartMoveTransform = {

    /** Pointer travel in pixels at which a press becomes a drag. */
    DRAG_THRESHOLD_PX: 4,

    /** Parses a "yyyy-MM-dd HH:mm:ss" wall-clock date into wall-clock minutes, or null when invalid. */
    parseWallClock: function (text) {
        if (typeof text !== "string") {
            return null;
        }
        var match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text),
            date,
            minutes;
        if (!match) {
            return null;
        }
        date = new Date(0);
        date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        date.setUTCHours(Number(match[4]), Number(match[5]), Number(match[6]), 0);
        minutes = date.getTime() / 60000;
        if (QCD.components.elements.GanttChartMoveTransform.formatWallClock(minutes) !== text) {
            return null;
        }
        return minutes;
    },

    /** Formats wall-clock minutes as "yyyy-MM-dd HH:mm:ss", or null for a non-finite value or a year outside 0000-9999. */
    formatWallClock: function (minutes) {
        if (typeof minutes !== "number" || !isFinite(minutes)) {
            return null;
        }
        var pad = function (value, length) {
            var text = String(value);
            while (text.length < length) {
                text = "0" + text;
            }
            return text;
        };
        var date = new Date(minutes * 60000),
            year = date.getUTCFullYear();
        if (!(year >= 0 && year <= 9999)) {
            return null;
        }
        return pad(year, 4) + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2) + " "
            + pad(date.getUTCHours(), 2) + ":" + pad(date.getUTCMinutes(), 2) + ":" + pad(date.getUTCSeconds(), 2);
    },

    snapMinutes: function (minutes, grid) {
        return Math.round(minutes / grid) * grid;
    },

    /** Converts the horizontal pixel travel of a dragged item into its snapped start date, or null when invalid. */
    toDropDate: function (originalDateFrom, deltaPx, hoursInterval, cellWidth, grid) {
        var start = QCD.components.elements.GanttChartMoveTransform.parseWallClock(originalDateFrom);
        if (start === null) {
            return null;
        }
        return QCD.components.elements.GanttChartMoveTransform.formatWallClock(
            QCD.components.elements.GanttChartMoveTransform.snapMinutes(start + deltaPx / cellWidth * hoursInterval * 60, grid));
    },

    /** Converts the distance between two dates into a horizontal pixel delta, or 0 when either date does not parse. */
    toPixelDelta: function (originalDateFrom, targetDate, hoursInterval, cellWidth) {
        var original = QCD.components.elements.GanttChartMoveTransform.parseWallClock(originalDateFrom);
        var target = QCD.components.elements.GanttChartMoveTransform.parseWallClock(targetDate);
        if (original === null || target === null) {
            return 0;
        }
        return (target - original) / (hoursInterval * 60) * cellWidth;
    },

    /** Returns the name of the row at a vertical position in the rows content, or null outside the rows. */
    resolveDropRow: function (contentY, rowHeight, rowNames) {
        if (!rowNames || typeof contentY !== "number" || !(contentY >= 0)) {
            return null;
        }
        var index = Math.floor(contentY / rowHeight);
        if (!(index >= 0 && index < rowNames.length)) {
            return null;
        }
        return rowNames[index];
    },

    /** Returns whether a point lies inside both rectangles, left and top edges included, right and bottom edges excluded. */
    isValidDropPoint: function (point, visibleRect, contentRect) {
        if (!point || !visibleRect || !contentRect) {
            return false;
        }
        var isInside = function (rect) {
            return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
        };
        return isInside(visibleRect) && isInside(contentRect);
    },

    gridStepPx: function (hoursInterval, cellWidth, grid) {
        return cellWidth * grid / (hoursInterval * 60);
    },

    /** Returns whether an item can be dragged: moves allowed, not a collision, safe non-zero integer id, grid step >= DRAG_THRESHOLD_PX. */
    isDraggable: function (item, isCollision, allowItemMove, hoursInterval, cellWidth, grid) {
        var maxSafeInteger = 9007199254740991;
        if (allowItemMove !== true || isCollision || !item || typeof item.id !== "number" || item.id === 0
                || Math.floor(item.id) !== item.id || Math.abs(item.id) > maxSafeInteger) {
            return false;
        }
        return QCD.components.elements.GanttChartMoveTransform.gridStepPx(hoursInterval, cellWidth, grid)
            >= QCD.components.elements.GanttChartMoveTransform.DRAG_THRESHOLD_PX;
    },

    /** Encodes a value as HTML text; "" for null and undefined. */
    escapeHtml: function (text) {
        if (text === null || text === undefined) {
            return "";
        }
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    buildMoveArgs: function (item, targetRow, dateFrom) {
        return [JSON.stringify({
            itemId: item.id,
            row: targetRow,
            dateFrom: dateFrom,
            originalRow: item.row,
            originalName: item.info.name,
            originalDateFrom: item.info.dateFrom,
            originalDateTo: item.info.dateTo
        })];
    },

    /** Returns snapBack, true unless the moveResult is accepted, and its message or null. */
    resolveMoveOutcome: function (moveResult) {
        return {
            snapBack: !(moveResult && moveResult.accepted === true),
            message: (moveResult && moveResult.message) || null
        };
    }
};

QCD.components.elements.GanttChart = function (_element, _mainController) {
    $.extend(this, new QCD.components.elements.FormComponent(_element, _mainController));

    var element = _element;

    var mainController = _mainController;

    var htmlElements = {};

    var _this = this;

    var constants = {
        CELL_WIDTH: 25,
        CELL_HEIGHT: 30,
        HEADER_HEIGHT: 60,
        ROW_NAMES_WIDTH: 200,
        RIGHT_SCROLL_WIDTH: 17,
        BOTTOM_SCROLL_HEIGHT: 16,
        // Milliseconds after a drag during which a click on the dragged item is ignored.
        CLICK_SUPPRESSION_MS: 1000,
        // Inline z-index of focused and dragged items; focus ring outline, offset and opacity.
        FOCUSED_ITEM_Z_INDEX: "220",
        DRAGGING_ITEM_Z_INDEX: "230",
        FOCUS_RING_OUTLINE: "2px solid #000000",
        FOCUS_RING_OFFSET: "-2px",
        FOCUSED_ITEM_OPACITY: "1",
        // Label fitting in px: minimum labelled width, label padding and collision icon padding.
        ITEM_LABEL_MIN_WIDTH_PX: 20,
        LABEL_PADDING_PX: 3,
        COLLISION_ICON_PADDING_PX: 32,
        // Distance in px from a rejection's first mousemove beyond which it is dismissed.
        REJECTION_DISMISS_DISTANCE_PX: 30
    };

    var keyCodes = {
        ENTER: 13,
        ESCAPE: 27,
        SPACE: 32,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40
    };

    var currentCellSettings;

    var stripsOrientation;
    var itemsBorderWidth;
    var itemsBorderColor;

    var rowsByName = {};
    var rowsByIndex = [];

    var currentWidth;
    var isVScrollVisible = false;
    var isHScrollVisible = false;

    var header;

    var selectedItem;

    var collisionInfoBoxContent;
    var collisionInfoBoxOverlay;

    var ganttTooltip;

    var moveTransform = QCD.components.elements.GanttChartMoveTransform;

    // Move in progress, or null; phase "pending", "active" or "keyboard"; drags keep lastPoint.
    var dragState = null,
        // DOM element of the focused item, or null.
        focusedItemNode = null,
        // Item element whose tooltip showFocusTooltip shows, or null.
        focusTooltipItemNode = null;

    // Id of the keyboard move help element, or null.
    var moveHelpId = null;

    // Textarea decodeHtmlText reuses, or null until first used.
    var htmlTextDecoder = null;

    // Dropped item awaiting the moveItem response, or null.
    var pendingMove = null;

    // Id of the item focused after the board is rebuilt from an accepted move, or null.
    var focusAfterMoveItemId = null;

    // Dragged item element whose click is ignored until expiresAt, or null.
    var clickSuppression = null;

    // Shown rejection, or null: item node, pane scroll and first mousemove point.
    var rejectionState = null;

    function constructor() {
        createGantt();
        createGanttTooltip();
        QCD.components.elements.utils.LoadingIndicator.blockElement(element);
        header.init();
    }

    this.getComponentValue = function () {
        var headerParameters = header.getCurrentParameters();
        var data = {
            headerParameters: headerParameters
        };
        if (selectedItem && selectedItem[0] && selectedItem[0].entityId) {
            data.selectedEntityId = selectedItem[0].entityId;
        }
        return data;
    };

    this.setComponentValue = function (value) {
        if (value.moveResult) {
            var outcome = moveTransform.resolveMoveOutcome(value.moveResult);
            if (outcome.snapBack) {
                // Rejected move: restores the dropped item and shows the reason next to it.
                var movedItemElement = pendingMove ? pendingMove.element : $("#" + _this.elementSearchName + "_item_" + value.moveResult.itemId);
                if (pendingMove) {
                    restoreItemPosition(pendingMove);
                }
                rejectionState = createRejectionState(movedItemElement);
                ganttTooltip.hide();
                var rejectionBody = "<div class='ganttItemDescriptionName'>" + (_this.options.translations["move.rejectedHeader"] || "") + "</div>"
                    + "<div class='ganttItemDescriptionInfo'>" + (outcome.message || "") + "</div>";
                var anchorRect = (movedItemElement.length > 0 ? movedItemElement[0] : element[0]).getBoundingClientRect();
                ganttTooltip.setBody(rejectionBody, "alert");
                ganttTooltip.showFor(rejectionState, (anchorRect.left + anchorRect.right) / 2, anchorRect.bottom,
                    rejectionBody, movedItemElement.length > 0 ? anchorRect : undefined);
                pendingMove = null;
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
                return;
            }
            if (!value.scale) {
                // Accepted move without its chart: restores the dropped item, hides the tooltip and unblocks the chart.
                if (pendingMove) {
                    restoreItemPosition(pendingMove);
                    pendingMove = null;
                }
                ganttTooltip.hide();
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
                return;
            }
            // Accepted move: restores the dropped item before the chart is rebuilt.
            if (pendingMove) {
                restoreItemPosition(pendingMove);
                pendingMove = null;
            }
        }
        applySettings(value);
        announceAcceptedMove(value);
        header.enableButtons();
        header.setDateFromValue(value.dateFrom, value.dateFromErrorMessage);
        header.setDateToValue(value.dateTo, value.dateToErrorMessage);
        header.setDateToValue(value.dateTo, value.dateToErrorMessage);
        header.setGlobalErrorMessage(value.globalErrorMessage);
        if (value.selectedEntityId) {
            if (selectedItem) {
                setItemSelected(selectedItem, false);
            }
            var newSelectedItem = $("#" + _this.elementSearchName + "_item_" + value.selectedEntityId);
            selectedItem = newSelectedItem;
            setItemSelected(newSelectedItem, true);
        }
        collisionInfoBoxOverlay.hide();
        if (!pendingMove) {
            QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
        }
    };

    // A reload or the loading indicator ends any press, drag or keyboard move without an event.
    this.performInitialize = function () {
        abandonDrag();
        refreshContent();
    };

    this.setComponentLoading = function (isLoadingVisible) {
        if (isLoadingVisible) {
            abandonDrag();
            QCD.components.elements.utils.LoadingIndicator.blockElement(element);
            header.disableButtons();
        } else {
            if (!pendingMove) {
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
            }
            header.enableButtons();
        }
    };

    this.onScaleChanged = function (newScale) {
        abandonDrag();
        header.setCurrentScale(newScale);
        refreshContent();
    };

    this.onDateChanged = function () {
        abandonDrag();
        refreshContent();
    };

    function onSelectChange() {
        if (_this.options.listeners.length > 0) {
            mainController.callEvent("select", _this.elementPath, null);
        }
    }

    function refreshContent() {
        QCD.components.elements.utils.LoadingIndicator.blockElement(element);
        mainController.callEvent("refresh", _this.elementPath);
    }


    function applySettings(cellSettings) {
        if (cellSettings.globalErrorMessage) {
            return;
        }
        if (!cellSettings.scale) {
            return;
        }

        updateHeader(cellSettings);

        stripsOrientation = cellSettings.stripsOrientation;
        itemsBorderWidth = cellSettings.itemsBorderWidth || 1;
        itemsBorderColor = cellSettings.itemsBorderColor || "silver";

        abandonDrag();
        if (_this.options.allowItemMove === true) {
            ganttTooltip.hide();
            dismissRejection();
        }

        htmlElements.rowNamesConteiner.children().remove();
        htmlElements.rowsContainer.children().remove();

        var contentWidth = constants.CELL_WIDTH * getTotalNumberOfCells(cellSettings);
        htmlElements.topRow1.width(contentWidth);
        htmlElements.topRow2.width(contentWidth);
        htmlElements.rowsContainer.width(contentWidth);

        rowsByName = {};
        rowsByIndex = [];
        for (var i = 0; i < cellSettings.rows.length; i++) {
            rowsByIndex[i] = addRow(cellSettings, cellSettings.rows[i]);
        }
        updateScroll();

        updateItems(cellSettings.items, cellSettings.collisions);

        currentCellSettings = cellSettings;

        rebindPendingMove();
    }

    /** Points the pending move at its re-rendered item element and that element's position. */
    function rebindPendingMove() {
        if (!pendingMove) {
            return;
        }
        var mountedItemElement = $("#" + _this.elementSearchName + "_item_" + pendingMove.itemId);
        pendingMove.element = mountedItemElement;
        pendingMove.preDragLeft = mountedItemElement.css("left");
        pendingMove.preDragTop = mountedItemElement.css("top");
    }

    /** Announces an accepted move, empties the alert and refocuses a keyboard-moved item. */
    function announceAcceptedMove(value) {
        if (!value.moveResult) {
            return;
        }
        var focusItemId = focusAfterMoveItemId;
        focusAfterMoveItemId = null;
        if (value.moveResult.accepted !== true || currentCellSettings !== value) {
            return;
        }
        ganttTooltip.announce(_this.options.translations["move.acceptedAnnouncement"] || "", "status");
        ganttTooltip.announce("", "alert");
        if (focusItemId !== null) {
            var movedItemNode = $("#" + _this.elementSearchName + "_item_" + focusItemId)[0];
            if (movedItemNode && movedItemNode.hasAttribute("tabindex")) {
                movedItemNode.focus();
            }
        }
    }

    /** Returns a rejection state for an item element at the rows pane scroll. */
    function createRejectionState(itemElement) {
        return {
            itemNode: itemElement.length > 0 ? itemElement[0] : null,
            scrollLeft: htmlElements.rowsContainerWrapper.scrollLeft(),
            scrollTop: htmlElements.rowsContainerWrapper.scrollTop(),
            originX: null,
            originY: null
        };
    }

    /** Clears the rejection, hides its tooltip and empties the alert region. */
    function dismissRejection() {
        var state = rejectionState;
        if (!state) {
            return;
        }
        rejectionState = null;
        if (ganttTooltip.isShowing(state)) {
            ganttTooltip.hide();
        }
        ganttTooltip.announce("", "alert");
    }

    /** Binds rejection dismissal on press, Escape, focus elsewhere, resize, scroll and mouse travel. */
    function bindRejectionDismissal() {
        document.addEventListener("pointerdown", function () {
            dismissRejection();
        }, true);
        document.addEventListener("keydown", function (eventObj) {
            if ((eventObj.which || eventObj.keyCode) === keyCodes.ESCAPE) {
                dismissRejection();
            }
        }, true);
        document.addEventListener("focusin", function (eventObj) {
            if (rejectionState && eventObj.target !== rejectionState.itemNode) {
                dismissRejection();
            }
        }, true);
        window.addEventListener("resize", function () {
            dismissRejection();
        }, false);
        htmlElements.rowsContainerWrapper[0].addEventListener("scroll", function () {
            var wrapper = htmlElements.rowsContainerWrapper;
            if (rejectionState && (wrapper.scrollLeft() !== rejectionState.scrollLeft
                    || wrapper.scrollTop() !== rejectionState.scrollTop)) {
                dismissRejection();
            }
        }, false);
        document.addEventListener("mousemove", onRejectionMouseMove, false);
    }

    /** Dismisses the rejection past REJECTION_DISMISS_DISTANCE_PX from its first mousemove. */
    function onRejectionMouseMove(eventObj) {
        var state = rejectionState,
            dx,
            dy;
        if (!state || !isFiniteNumber(eventObj.clientX) || !isFiniteNumber(eventObj.clientY)) {
            return;
        }
        if (state.originX === null) {
            state.originX = eventObj.clientX;
            state.originY = eventObj.clientY;
            return;
        }
        dx = eventObj.clientX - state.originX;
        dy = eventObj.clientY - state.originY;
        if (Math.sqrt(dx * dx + dy * dy) > constants.REJECTION_DISMISS_DISTANCE_PX) {
            dismissRejection();
        }
    }

    function updateItems(items, collisions) {
        var moveHoursInterval = getMoveHoursInterval();
        for (var itemIndex in items) {
            var item = items[itemIndex];
            addItem(item, false, moveHoursInterval);
        }
        for (var itemIndex in collisions) {
            var item = collisions[itemIndex];
            addItem(item, true);
        }
    }

    /** Returns the hours per cell at the current scale on charts that allow item moves, or undefined. */
    function getMoveHoursInterval() {
        if (_this.options.allowItemMove !== true || !_this.options.zoomHoursIntervals) {
            return undefined;
        }
        return _this.options.zoomHoursIntervals[header.getCurrentParameters().scale];
    }

    function showCollisionBox(ganttItem) {
        collisionInfoBoxContent.children().remove();
        for (var i = 0; i < ganttItem.items.length; i++) {
            var collisionItem = ganttItem.items[i];

            var collisionItemElement = $("<div>").addClass("collisionInfoBoxItem").html(collisionItem.info.name);
            collisionItemElement.attr("id", _this.elementPath + "_collisionItem_" + collisionItem.id);
            collisionItemElement[0].entityId = collisionItem.id;

            collisionItemElement.click(function () {
                var itemElement = $(this);
                var itemId = this.entityId;
                if (selectedItem) {
                    setItemSelected(selectedItem, false);
                    $("#" + _this.elementSearchName + "_collisionItem_" + selectedItem[0].entityId).removeClass("ganttItemSelected");
                }
                var ganttElement = $("#" + _this.elementSearchName + "_item_" + itemId);
                selectedItem = ganttElement;
                itemElement.addClass("ganttItemSelected");
                setItemSelected(ganttElement, true);
                onSelectChange();
                if (_this.options.allowItemMove === true) {
                    collisionInfoBoxOverlay.hide();
                }
            });

            collisionInfoBoxContent.append(collisionItemElement);
        }
        collisionInfoBoxOverlay.show();
        if (selectedItem) {
            $("#" + _this.elementSearchName + "_collisionItem_" + selectedItem[0].entityId).addClass("ganttItemSelected");
        }
    }

    function createGantt() {
        header = new QCD.components.elements.GanttChartHeader(_this, _this.elementPath + "_header", _this.options.translations, _this.options);
        element.append(header.getHeaderElement());

        htmlElements.wrapper = $("<div>").addClass("ganttContainer");
        element.append(htmlElements.wrapper);

        htmlElements.rowNamesWrapper = $("<div>").addClass("ganttRowNamesWrapper");
        htmlElements.rowNamesWrapper.width(constants.ROW_NAMES_WIDTH - 1);
        htmlElements.rowNamesWrapper.height("100%");
        htmlElements.wrapper.append(htmlElements.rowNamesWrapper);

        htmlElements.centerContainer = $("<div>").addClass("ganttCenterConteiner");
        htmlElements.centerContainer.css("left", constants.ROW_NAMES_WIDTH + "px");
        htmlElements.wrapper.append(htmlElements.centerContainer);

        // ROW NAMES
        htmlElements.rowNamesButtonsConteiner = $("<div>").addClass("ganttRowNamesButtonsConteiner");
        htmlElements.rowNamesButtonsConteiner.height(constants.HEADER_HEIGHT - 1);
        htmlElements.rowNamesWrapper.append(htmlElements.rowNamesButtonsConteiner);

        htmlElements.rowNamesConteiner = $("<div>").addClass("ganttRowNamesConteiner");
        htmlElements.rowNamesWrapper.append(htmlElements.rowNamesConteiner);

        // CENTER
        htmlElements.topRow = $("<div>").addClass("ganttTopRow");
        htmlElements.topRow.height(constants.HEADER_HEIGHT - 1);
        htmlElements.centerContainer.append(htmlElements.topRow);

        htmlElements.topRow1 = $("<div>").addClass("ganttTopRow1");
        htmlElements.topRow1.height((constants.HEADER_HEIGHT / 2) - 1);
        htmlElements.topRow1.css("line-height", ((constants.HEADER_HEIGHT / 2) - 1) + "px");
        htmlElements.topRow.append(htmlElements.topRow1);
        htmlElements.topRow2 = $("<div>").addClass("ganttTopRow2");
        htmlElements.topRow2.height((constants.HEADER_HEIGHT / 2));
        htmlElements.topRow2.css("line-height", ((constants.HEADER_HEIGHT / 2) - 1) + "px");
        htmlElements.topRow.append(htmlElements.topRow2);

        htmlElements.rowsContainerWrapper = $("<div>").addClass("rowsContainerWrapper");
        htmlElements.centerContainer.append(htmlElements.rowsContainerWrapper);

        htmlElements.rowsContainer = $("<div>").addClass("rowsContainer");
        htmlElements.rowsContainerWrapper.append(htmlElements.rowsContainer);

        // SCROLL
        htmlElements.rowsContainerWrapper.scroll(function (eventObject) {
            var scrollLeft = htmlElements.rowsContainerWrapper.scrollLeft();
            htmlElements.topRow.scrollLeft(scrollLeft);

            var scrollTop = htmlElements.rowsContainerWrapper.scrollTop();
            htmlElements.rowNamesConteiner.scrollTop(scrollTop);

            discardDetachedDrag();
            if (dragState && dragState.phase === "active") {
                updateDragTarget(dragState.lastPoint);
            }
        });

        var collisionInfoBox = $("<div>").addClass("collisionInfoBox").click(function () {
            return false;
        });
        var collisionInfoBoxWrapper = $("<div>").addClass("collisionInfoBoxWrapper");
        collisionInfoBoxOverlay = $("<div>").addClass("collisionInfoBoxOverlay").click(function () {
            $(this).hide()
        });
        collisionInfoBoxOverlay.append(collisionInfoBoxWrapper);
        collisionInfoBoxWrapper.append(collisionInfoBox);
        element.css("position", "relative");
        element.append(collisionInfoBoxOverlay);

        var collisionInfoBoxHeader = $("<div>").addClass("collisionInfoBoxHeader").html(_this.options.translations["colisionBox.header"]);
        var closeButton = $("<div>").addClass("collisionInfoBoxHeaderCloseButton").attr("title", _this.options.translations["colisionBox.closeButton"]);
        closeButton.click(function () {
            collisionInfoBoxOverlay.hide();
        });
        collisionInfoBoxHeader.append(closeButton);

        collisionInfoBoxContent = $("<div>").addClass("collisionInfoBoxContent");
        collisionInfoBox.append(collisionInfoBoxHeader);
        collisionInfoBox.append(collisionInfoBoxContent);

        if (_this.options.allowItemMove === true) {
            var keyboardHelpText = getKeyboardHelpText();
            if (keyboardHelpText.length > 0) {
                moveHelpId = _this.elementPath + "_moveHelp";
                htmlElements.moveHelp = $("<div>").addClass("ganttChartMoveHelp");
                htmlElements.moveHelp.css(QCD.components.elements.GanttChartVisuallyHiddenStyle);
                htmlElements.moveHelp.attr("id", moveHelpId);
                htmlElements.moveHelp.text(keyboardHelpText);
                element.append(htmlElements.moveHelp);
            }
            bindItemHandlers();
            bindRejectionDismissal();
        }
    }

    /** Delegates item pointer, key, hover and focus handlers from the rows container. */
    function bindItemHandlers() {
        var rowsContainerNode = htmlElements.rowsContainer[0];
        htmlElements.rowsContainer.on({
            "pointerdown": function (eventObj) {
                startPress(eventObj, this.ganttItem, $(this));
            },
            "pointermove": onDragMove,
            "pointerup": endDrag,
            "pointercancel": cancelDrag,
            "lostpointercapture": onLostPointerCapture
        }, ".ganttItemDraggable");
        htmlElements.rowsContainer.on("keydown", ".ganttItem[tabindex]", function (eventObj) {
            var itemElement = $(this);
            onItemKeyDown(eventObj, this.ganttItem, itemElement);
            updateItemLayer(itemElement);
            updateItemFocusRing(itemElement);
        });
        htmlElements.rowsContainer.on("pointerover", ".ganttItem", function () {
            if (focusTooltipItemNode !== null && focusTooltipItemNode !== this) {
                hideFocusTooltip();
            }
        });
        rowsContainerNode.addEventListener("focusin", function (event) {
            if (isFocusableItemNode(event.target)) {
                onItemFocus($(event.target));
            }
        }, false);
        rowsContainerNode.addEventListener("focusout", function (event) {
            if (isFocusableItemNode(event.target)) {
                onItemBlur($(event.target));
            }
        }, false);
    }

    /** Returns whether a node is a ganttItem element with a tabindex. */
    function isFocusableItemNode(node) {
        return !!node && node.nodeType === 1 && node.hasAttribute("tabindex") && $(node).hasClass("ganttItem");
    }

    /** Returns the move.keyboardHelp translation with "{0}" replaced by moveGridMinutes, or "". */
    function getKeyboardHelpText() {
        var template = _this.options.translations["move.keyboardHelp"],
            gridMinutes = _this.options.moveGridMinutes;
        if (typeof template !== "string" || template.length === 0) {
            return "";
        }
        return template.split("{0}").join(gridMinutes === null || gridMinutes === undefined ? "" : String(gridMinutes));
    }

    function createGanttTooltip() {
        ganttTooltip = new QCD.components.elements.GanttChartTooltip(element);
        if (_this.options.allowItemMove === true) {
            ganttTooltip.enableLiveFeedback();
            ganttTooltip.enableMoveLayout();
        }
    }

    function setVerticalScrollVisible(visible) {
        isVScrollVisible = visible;
        var topRowWidth = currentWidth - constants.ROW_NAMES_WIDTH;
        if (visible) {
            topRowWidth -= constants.RIGHT_SCROLL_WIDTH;
        }
        htmlElements.topRow.width(topRowWidth);
    }

    function setHorizontalScrollVisible(visible) {
        isHScrollVisible = visible;
        var rowNamesHeight = htmlElements.rowNamesWrapper.height() - htmlElements.topRow.height() - 1;
        // Move-enabled charts subtract the rows pane's scroll bar height.
        if (_this.options.allowItemMove === true) {
            var rowsPane = htmlElements.rowsContainerWrapper[0];
            rowNamesHeight -= rowsPane.offsetHeight - rowsPane.clientHeight;
        } else if (visible) {
            rowNamesHeight -= constants.BOTTOM_SCROLL_HEIGHT;
        }
        htmlElements.rowNamesConteiner.height(rowNamesHeight);
    }

    function updateHeader(cellSettings) {
        header.setCurrentScale(cellSettings.zoomLevel);
        htmlElements.topRow1.children().remove();
        htmlElements.topRow2.children().remove();
        for (var i = 0; i < cellSettings.scale.categories.length; i++) {
            var categoryCellsNumber = getCategoryCellsNumber(cellSettings, i);

            var cellElement = $("<div>").height("100%").width((categoryCellsNumber * constants.CELL_WIDTH) - 1).addClass("ganttTopRowElement").addClass("ganttTopRowElementEnd");
            cellElement.html(cellSettings.scale.categories[i]);

            htmlElements.topRow1.append(cellElement);

            var labelNumber = cellSettings.scale.elementLabelInitialNumber ? cellSettings.scale.elementLabelInitialNumber : 0;
            var bottomElement = null;
            for (var bottomI = 0; bottomI < categoryCellsNumber; bottomI++) {
                bottomElement = $("<div>").height(htmlElements.topRow2.height() - 1).width(constants.CELL_WIDTH - 1).addClass("ganttTopRowElement");
                var bottomElementContent = null;
                var moveLabelLeft = false;
                if (cellSettings.scale.elementLabelsValues) {
                    if (i == 0 && cellSettings.scale.firstCategoryFirstElement) {
                        bottomElementContent = cellSettings.scale.elementLabelsValues[bottomI + cellSettings.scale.firstCategoryFirstElement - 1];
                    } else {
                        bottomElementContent = cellSettings.scale.elementLabelsValues[bottomI];
                    }
                } else {
                    bottomElementContent = labelNumber;
                    moveLabelLeft = true;
                }
                if (moveLabelLeft) {
                    bottomElement.html("<div>" + bottomElementContent + "</div>");
                } else {
                    bottomElement.html(bottomElementContent);
                }
                htmlElements.topRow2.append(bottomElement);
                labelNumber += cellSettings.scale.elementLabelsInterval;
            }
            bottomElement.addClass("ganttTopRowElementEnd");
        }
    }

    function getCategoryCellsNumber(cellSettings, i) {
        if (cellSettings.scale.elementsInCategory instanceof Array) {
            return cellSettings.scale.elementsInCategory[i];
        } else {
            if (cellSettings.scale.categories.length == 1 && cellSettings.scale.firstCategoryFirstElement && cellSettings.scale.lastCategoryLastElement) {
                return cellSettings.scale.lastCategoryLastElement - cellSettings.scale.firstCategoryFirstElement + 1;
            } else if (i == 0 && cellSettings.scale.firstCategoryFirstElement) {
                return cellSettings.scale.elementsInCategory - cellSettings.scale.firstCategoryFirstElement + 1;
            } else if (i == cellSettings.scale.categories.length - 1 && cellSettings.scale.lastCategoryLastElement) {
                return cellSettings.scale.lastCategoryLastElement;
            } else {
                return cellSettings.scale.elementsInCategory;
            }
        }
    }

    function getTotalNumberOfCells(cellSettings) {
        var totalCellsNumber = 0;
        for (var i = 0; i < cellSettings.scale.categories.length; i++) {
            totalCellsNumber += getCategoryCellsNumber(cellSettings, i);
        }
        return totalCellsNumber;
    }

    /** Fits an item label on one ellipsed line, writing it when the item is at least minWidth wide. */
    function fitItemLabel(itemElementContent, labelHtml, width, minWidth, padding) {
        itemElementContent.css({
            "left": "0",
            "right": "0",
            "white-space": "nowrap",
            "overflow": "hidden",
            "text-overflow": "ellipsis",
            "text-align": "left"
        });
        itemElementContent.css(padding);
        if (width >= minWidth && labelHtml !== null && labelHtml !== undefined && labelHtml !== "") {
            itemElementContent.html(labelHtml);
        }
    }

    function addRow(cellSettings, rowName) {
        var rowNameElement = $("<div>").height(constants.CELL_HEIGHT - 1).addClass("ganttRowNameElement");
        rowNameElement.css("line-height", (constants.CELL_HEIGHT - 1) + "px");
        if (_this.options.allowItemMove === true) {
            rowNameElement.text(rowName);
            rowNameElement.attr("title", rowName);
            rowNameElement.css({
                "white-space": "nowrap",
                "overflow": "hidden",
                "text-overflow": "ellipsis",
                "padding": "0 " + constants.LABEL_PADDING_PX + "px"
            });
        } else {
            rowNameElement.html(rowName);
        }
        htmlElements.rowNamesConteiner.append(rowNameElement);

        var rowElement = $("<div>").height(constants.CELL_HEIGHT - 1).addClass("ganttRowElement");
        htmlElements.rowsContainer.append(rowElement);

        var alignCellsTop = _this.options.allowItemMove === true;
        for (var i = 0; i < cellSettings.scale.categories.length; i++) {
            var categoryCellsNumber = getCategoryCellsNumber(cellSettings, i);
            var cellElement;
            for (var bottomI = 0; bottomI < categoryCellsNumber; bottomI++) {
                cellElement = $("<div>").height(constants.CELL_HEIGHT - 1).width(constants.CELL_WIDTH - 1).addClass("ganttCellElement");
                cellElement.attr("id", "ganttCellElement_" + i + "_" + bottomI);
                if (alignCellsTop) {
                    cellElement.css("vertical-align", "top");
                }
                rowElement.append(cellElement);
            }
            cellElement.addClass("ganttTopRowElementEnd");
        }
        rowsByName[rowName] = rowElement;
        return rowElement;
    }

    /** Builds the hover tooltip HTML: header, content lines, start and end. */
    function createTooltipContent(item) {
        var tooltip = item.info.tooltip,
            description = "",
            content = tooltip.content || [],
            contentLen = content.length,
            i;
        if (typeof tooltip.header === 'string') {
            description += "<div class='ganttItemDescriptionName'>" + tooltip.header + "</div>"
        }
        for (i = 0; i < contentLen; i++) {
            description += "<div class='ganttItemDescriptionInfo'>" + content[i] + "</div>";
        }
        description += "<div class='ganttItemDescriptionInfo'>";
        description += "<div class='ganttItemDescriptionLabel'>" + _this.options.translations["description.dateFrom"] + "</div>";
        description += "<div class='ganttItemDescriptionValue'>" + item.info.dateFrom + "</div></div>";
        description += "<div class='ganttItemDescriptionInfo'>";
        description += "<div class='ganttItemDescriptionLabel'>" + _this.options.translations["description.dateTo"] + "</div>";
        description += "<div class='ganttItemDescriptionValue'>" + item.info.dateTo + "</div></div>";
        return description;
    }

    /** Renders an item with its handlers and, on move-enabled charts, keyboard access. */
    function addItem(item, isCollision, moveHoursInterval) {
        var row = rowsByName[item.row];
        var itemElement = $("<div>").addClass("ganttItem");
        itemElement.css("line-height", (constants.CELL_HEIGHT - 4 - (2 * itemsBorderWidth)) + "px");
        var left = (constants.CELL_WIDTH * item.from);
        var right = (constants.CELL_WIDTH * item.to);
        var width = right - left;
        itemElement.width(width - (2 * itemsBorderWidth) + 1);
        itemElement.height(constants.CELL_HEIGHT - 3 - (2 * itemsBorderWidth));
        itemElement.css("top", "1px");
        itemElement.css("left", (left - 1) + "px");
        itemElement.css("border-width", itemsBorderWidth + "px");
        itemElement.css("border-color", itemsBorderColor);
        row.append(itemElement);
        if (item.type) {
            itemElement.addClass("ganttItemType_" + item.type);
        }

        if (item.strips) {
            for (var stripIdx = 0; stripIdx < item.strips.length; stripIdx++) {
                var strip = item.strips[stripIdx];
                itemElement.append(createStripElement(strip));
            }
        }

        var itemElementContent = $("<div>").addClass("ganttItemContent");

        if (isCollision) {
            itemElement.addClass("ganttCollisionItem");
            if (_this.options.allowItemMove === true) {
                if (width > 15) {
                    itemElement.addClass("withIcon");
                }
                itemElement.css("overflow", "hidden");
                fitItemLabel(itemElementContent, _this.options.translations["colisionElementName"], width,
                    constants.COLLISION_ICON_PADDING_PX + constants.ITEM_LABEL_MIN_WIDTH_PX, {
                        "padding-right": constants.LABEL_PADDING_PX + "px"
                    });
            } else if (width > 30) {
                itemElement.addClass("withIcon");
                itemElementContent.html(_this.options.translations["colisionElementName"]);
                itemElementContent.shorten({width: width, tail: "...", tooltip: false});
            } else if (width > 15) {
                itemElement.addClass("withIcon");
            }
            itemElement[0].isCollision = true; // add isCollision to DOM element
            itemElement[0].ganttItem = item; // add item element to DOM
        } else if (_this.options.allowItemMove === true) {
            fitItemLabel(itemElementContent, item.info.name, width, constants.ITEM_LABEL_MIN_WIDTH_PX, {
                "padding": "0 " + constants.LABEL_PADDING_PX + "px"
            });
        } else {
            if (width > 30) {
                itemElementContent.html(item.info.name);
                itemElementContent.shorten({width: width, tail: "...", tooltip: false});
            }
        }
        itemElement.append(itemElementContent);

        // Hover shows the item's body, except while moving or over its own rejection.
        if (_this.options.hasPopupInfo) {
            itemElement.bind({
                "mousemove": function (eventObj) {
                    if (dragState && dragState.phase !== "pending") {
                        return;
                    }
                    if (_this.options.allowItemMove !== true) {
                        ganttTooltip.show(eventObj.clientX, eventObj.clientY, createTooltipContent(item));
                        return;
                    }
                    if (rejectionState && rejectionState.itemNode === this && ganttTooltip.isShowing(rejectionState)) {
                        return;
                    }
                    ganttTooltip.showFor(this, eventObj.clientX, eventObj.clientY, createTooltipContent(item));
                },
                "mouseleave": function (eventObj) {
                    if (dragState && dragState.phase !== "pending") {
                        return;
                    }
                    ganttTooltip.hide();
                }
            });
        }

        if (item.id || isCollision) {
            itemElement.attr("id", _this.elementPath + "_item_" + item.id);
            itemElement[0].entityId = item.id; // add entityId to DOM element
            itemElement.css("cursor", "pointer");
            // A click inside a collision item listing this item opens its box.
            itemElement.click(function (eventObj) {
                if (consumeClickSuppression(this)) {
                    return;
                }
                if (this.isCollision) {
                    showCollisionBox(this.ganttItem);
                    return;
                }
                var collisionNode = findCollisionItemAtClick(this, eventObj);
                if (collisionNode !== null) {
                    showCollisionBox(collisionNode.ganttItem);
                    return;
                }
                selectItemElement($(this));
            });
        }

        if (_this.options.allowItemMove === true && !isCollision) {
            setItemAccessibility(itemElement[0], item, moveTransform.isDraggable(item, isCollision,
                _this.options.allowItemMove, moveHoursInterval, constants.CELL_WIDTH, _this.options.moveGridMinutes));
        }

        itemElement.mouseover(function () {
            $(this).addClass("ganttItemHovered");
        }).mouseout(function () {
            $(this).removeClass("ganttItemHovered");
        });
    }

    /** Makes an item focusable: a named button, draggable when allowed, or a named image. */
    function setItemAccessibility(itemNode, item, isDraggable) {
        itemNode.ganttItem = item;
        itemNode.setAttribute("tabindex", "0");
        if (!item.id) {
            itemNode.setAttribute("role", "img");
            itemNode.setAttribute("aria-label", getContentAccessibleName(item));
            return;
        }
        itemNode.setAttribute("role", "button");
        itemNode.setAttribute("aria-label", getItemAccessibleName(item));
        itemNode.setAttribute("aria-pressed", "false");
        if (isDraggable) {
            itemNode.className += " ganttItemDraggable";
            itemNode.style.cursor = "move";
            if (moveHelpId !== null) {
                itemNode.setAttribute("aria-describedby", moveHelpId);
            }
        }
    }

    /** Selects an item as a click does, sending the select event. */
    function selectItemElement(itemElement) {
        if (selectedItem) {
            setItemSelected(selectedItem, false);
        }
        selectedItem = itemElement;
        setItemSelected(itemElement, true);
        onSelectChange();
    }

    /** Toggles ganttItemSelected on items and their button aria-pressed state. */
    function setItemSelected(itemElement, isSelected) {
        if (isSelected) {
            itemElement.addClass("ganttItemSelected");
        } else {
            itemElement.removeClass("ganttItemSelected");
        }
        itemElement.each(function () {
            if (this.getAttribute("role") === "button") {
                this.setAttribute("aria-pressed", isSelected ? "true" : "false");
            }
        });
    }

    /** Returns the collision item under the click listing the item, or null. */
    function findCollisionItemAtClick(itemNode, eventObj) {
        var x = eventObj.clientX,
            y = eventObj.clientY,
            collisionNodes,
            collisionNode,
            rect,
            i;
        if (_this.options.allowItemMove !== true || !isFiniteNumber(x) || !isFiniteNumber(y)) {
            return null;
        }
        collisionNodes = $(itemNode).siblings(".ganttCollisionItem");
        for (i = 0; i < collisionNodes.length; i++) {
            collisionNode = collisionNodes[i];
            if (!collisionListsItem(collisionNode.ganttItem, itemNode.entityId)) {
                continue;
            }
            rect = collisionNode.getBoundingClientRect();
            if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
                return collisionNode;
            }
        }
        return null;
    }

    /** Returns whether a collision item's box lists an item id. */
    function collisionListsItem(collisionItem, itemId) {
        var items = collisionItem ? collisionItem.items : null,
            i;
        if (!items) {
            return false;
        }
        for (i = 0; i < items.length; i++) {
            if (items[i] && items[i].id === itemId) {
                return true;
            }
        }
        return false;
    }

    /** Returns an item's accessible name: decoded label, row, start and end. */
    function getItemAccessibleName(item) {
        return joinTexts([decodeHtmlText(item.info.name)].concat(getItemPlacementTexts(item)), ", ");
    }

    /** Returns an id-less item's accessible name with its header and content lines. */
    function getContentAccessibleName(item) {
        var tooltip = item.info.tooltip || {},
            content = tooltip.content || [],
            name = decodeHtmlText(item.info.name),
            texts = [name],
            header,
            i;
        if (typeof tooltip.header === "string") {
            header = decodeHtmlText(tooltip.header);
            if (joinTexts([header], "") !== joinTexts([name], "")) {
                texts.push(header);
            }
        }
        for (i = 0; i < content.length; i++) {
            texts.push(decodeHtmlText(content[i]));
        }
        return joinTexts(texts.concat(getItemPlacementTexts(item)), ", ");
    }

    /** Returns an item's row, start and end texts. */
    function getItemPlacementTexts(item) {
        var translations = _this.options.translations;
        return [
            toText(item.row),
            joinTexts([toText(translations["description.dateFrom"]), toText(item.info.dateFrom)], " "),
            joinTexts([toText(translations["description.dateTo"]), toText(item.info.dateTo)], " ")
        ];
    }

    /** Decodes HTML character references in a reused textarea; markup stays text. */
    function decodeHtmlText(html) {
        var text;
        if (html === null || html === undefined) {
            return "";
        }
        text = String(html);
        if (text.indexOf("&") === -1) {
            return text;
        }
        if (htmlTextDecoder === null) {
            htmlTextDecoder = document.createElement("textarea");
        }
        htmlTextDecoder.innerHTML = text;
        return htmlTextDecoder.value;
    }

    function toText(value) {
        return value === null || value === undefined ? "" : String(value);
    }

    /** Joins the white-space-collapsed, trimmed, non-empty texts with a separator. */
    function joinTexts(texts, separator) {
        var parts = [],
            text,
            i;
        for (i = 0; i < texts.length; i++) {
            text = $.trim(texts[i].replace(/\s+/g, " "));
            if (text.length > 0) {
                parts.push(text);
            }
        }
        return parts.join(separator);
    }

    /** Handles item keys: arrows move, Enter/Space select or confirm, Escape hides or cancels. */
    function onItemKeyDown(eventObj, item, itemElement) {
        var oe = eventObj.originalEvent || eventObj,
            keyCode = eventObj.which || eventObj.keyCode;
        if (oe.altKey || oe.ctrlKey || oe.metaKey) {
            return;
        }
        discardDetachedDrag();
        if (pendingMove || (dragState && dragState.phase !== "keyboard")) {
            return;
        }
        if (dragState && dragState.element[0] !== itemElement[0]) {
            cancelKeyboardMove();
        }
        if (!dragState) {
            if (keyCode === keyCodes.ENTER || keyCode === keyCodes.SPACE) {
                if (itemElement[0].getAttribute("role") === "button") {
                    eventObj.preventDefault();
                    selectItemElement(itemElement);
                }
            } else if (keyCode === keyCodes.ESCAPE) {
                hideFocusTooltip();
            } else if (isArrowKey(keyCode) && itemElement.hasClass("ganttItemDraggable")) {
                eventObj.preventDefault();
                startKeyboardMove(item, itemElement);
                if (!applyKeyboardStep(keyCode)) {
                    dragState = null;
                }
            }
            return;
        }
        if (isArrowKey(keyCode)) {
            eventObj.preventDefault();
            applyKeyboardStep(keyCode);
        } else if (keyCode === keyCodes.ENTER || keyCode === keyCodes.SPACE) {
            eventObj.preventDefault();
            confirmKeyboardMove();
        } else if (keyCode === keyCodes.ESCAPE) {
            eventObj.preventDefault();
            cancelKeyboardMove();
        }
    }

    function isArrowKey(keyCode) {
        return keyCode === keyCodes.LEFT || keyCode === keyCodes.UP || keyCode === keyCodes.RIGHT
            || keyCode === keyCodes.DOWN;
    }

    /** Starts a keyboard move of an item at zero steps in its row. */
    function startKeyboardMove(item, itemElement) {
        var originIndex = currentCellSettings.rows.indexOf(item.row);
        dragState = {
            phase: "keyboard",
            pointerId: null,
            element: itemElement,
            item: item,
            originRow: item.row,
            originIndex: originIndex,
            preDragLeft: itemElement.css("left"),
            preDragTop: itemElement.css("top"),
            startX: null,
            startY: null,
            dateFrom: item.info.dateFrom,
            dateTo: item.info.dateTo,
            hoursInterval: _this.options.zoomHoursIntervals[header.getCurrentParameters().scale],
            targetDate: null,
            targetRow: null,
            steps: 0,
            rowIndex: originIndex
        };
    }

    /** Applies an arrow step, showing its target below the item; false, unchanged, if refused. */
    function applyKeyboardStep(keyCode) {
        var grid = _this.options.moveGridMinutes,
            rows = currentCellSettings.rows,
            steps = dragState.steps,
            rowIndex = dragState.rowIndex,
            date,
            deltaPx,
            drawnStart,
            itemNode,
            itemRect,
            body;
        if (keyCode === keyCodes.LEFT) {
            steps -= 1;
        } else if (keyCode === keyCodes.RIGHT) {
            steps += 1;
        } else if (keyCode === keyCodes.UP) {
            rowIndex = Math.max(0, rowIndex - 1);
        } else {
            rowIndex = Math.min(rows.length - 1, rowIndex + 1);
        }
        date = moveTransform.toDropDate(dragState.dateFrom,
            steps * moveTransform.gridStepPx(dragState.hoursInterval, constants.CELL_WIDTH, grid), dragState.hoursInterval,
            constants.CELL_WIDTH, grid);
        deltaPx = moveTransform.toPixelDelta(dragState.dateFrom, date, dragState.hoursInterval, constants.CELL_WIDTH);
        if (steps !== dragState.steps) {
            drawnStart = parseFloat(dragState.preDragLeft) + 1 + deltaPx;
            if (date === null || (steps < dragState.steps && !(drawnStart >= 0))
                    || (steps > dragState.steps && !(drawnStart < getTotalNumberOfCells(currentCellSettings) * constants.CELL_WIDTH))) {
                return false;
            }
        }

        dragState.steps = steps;
        dragState.rowIndex = rowIndex;
        dragState.targetDate = date;
        dragState.targetRow = rows[rowIndex];
        setItemDragging(dragState.element, true);
        dragState.element.css("left", (parseFloat(dragState.preDragLeft) + deltaPx) + "px");
        dragState.element.css("top", (1 + (rowIndex - dragState.originIndex) * constants.CELL_HEIGHT) + "px");

        itemNode = dragState.element[0];
        if (itemNode.scrollIntoView) {
            itemNode.scrollIntoView({block: "nearest", inline: "nearest"});
        }
        itemRect = itemNode.getBoundingClientRect();
        body = getDragTargetBody(dragState.targetRow, date);
        ganttTooltip.setBody(body, "status");
        ganttTooltip.show((itemRect.left + itemRect.right) / 2, itemRect.bottom, body, itemRect);
        return true;
    }

    /** Sends the keyboard move, or cancels it when its target is incomplete or unchanged. */
    function confirmKeyboardMove() {
        var isTargetMissing = dragState.targetRow === null || dragState.targetDate === null;
        var isTargetUnchanged = dragState.targetDate === dragState.dateFrom && dragState.targetRow === dragState.originRow;
        if (isTargetMissing || isTargetUnchanged) {
            cancelKeyboardMove();
            return;
        }
        ganttTooltip.hide();
        sendMove(dragState.item.id);
    }

    function cancelKeyboardMove() {
        restoreDraggedItem();
        ganttTooltip.hide();
    }

    /** Styles the focused item; on :focus-visible scrolls it into view and shows an image's tooltip. */
    function onItemFocus(itemElement) {
        var itemNode = itemElement[0];
        focusedItemNode = itemNode;
        updateItemLayer(itemElement);
        updateItemFocusRing(itemElement);
        if (dragState || !matchesFocusVisible(itemNode)) {
            return;
        }
        if (itemNode.scrollIntoView) {
            itemNode.scrollIntoView({block: "nearest", inline: "nearest"});
        }
        if (_this.options.hasPopupInfo && itemNode.getAttribute("role") === "img") {
            showFocusTooltip(itemNode);
        }
    }

    /** Clears the item's focus, keyboard move and focus tooltip and resets its styles. */
    function onItemBlur(itemElement) {
        if (focusedItemNode === itemElement[0]) {
            focusedItemNode = null;
        }
        if (dragState && dragState.phase === "keyboard" && dragState.element[0] === itemElement[0]) {
            cancelKeyboardMove();
        }
        if (focusTooltipItemNode === itemElement[0]) {
            hideFocusTooltip();
        }
        updateItemLayer(itemElement);
        updateItemFocusRing(itemElement);
    }

    /** Shows an item's hover tooltip below it and records its element. */
    function showFocusTooltip(itemNode) {
        var body = createTooltipContent(itemNode.ganttItem),
            itemRect;
        focusTooltipItemNode = itemNode;
        ganttTooltip.setBody(body);
        itemRect = itemNode.getBoundingClientRect();
        ganttTooltip.show((itemRect.left + itemRect.right) / 2, itemRect.bottom, body, itemRect);
    }

    /** Hides the tooltip and forgets the showFocusTooltip element. */
    function hideFocusTooltip() {
        focusTooltipItemNode = null;
        ganttTooltip.hide();
    }

    /** Returns whether an element matches :focus-visible, or true when that cannot be read. */
    function matchesFocusVisible(node) {
        var matches = node.matches || node.msMatchesSelector || node.webkitMatchesSelector;
        if (typeof matches !== "function") {
            return true;
        }
        try {
            return matches.call(node, ":focus-visible");
        } catch (selectorError) {
            return true;
        }
    }

    /** Sets the focused item's ring and opacity under :focus-visible and clears them on others. */
    function updateItemFocusRing(itemElement) {
        var itemNode = itemElement[0],
            isRingShown;
        if (!itemNode) {
            return;
        }
        if (itemNode === focusedItemNode) {
            isRingShown = matchesFocusVisible(itemNode);
            itemElement.css({
                "outline": isRingShown ? constants.FOCUS_RING_OUTLINE : "none",
                "outline-offset": constants.FOCUS_RING_OFFSET,
                "opacity": isRingShown && !itemElement.hasClass("ganttItemDragging") ? constants.FOCUSED_ITEM_OPACITY : ""
            });
        } else {
            itemElement.css({
                "outline": "",
                "outline-offset": "",
                "opacity": ""
            });
        }
    }

    function getDragTargetBody(row, date) {
        return "<div class='ganttItemDescriptionName'>" + moveTransform.escapeHtml(row) + "</div>"
            + "<div class='ganttItemDescriptionInfo'><div class='ganttItemDescriptionLabel'>" + (_this.options.translations["description.dateFrom"] || "") + "</div>"
            + "<div class='ganttItemDescriptionValue'>" + moveTransform.escapeHtml(date) + "</div></div>";
    }

    /** Starts a captured primary-button press at the pointer; other presses are ignored. */
    function startPress(eventObj, item, itemElement) {
        var oe = eventObj.originalEvent || eventObj;
        discardDetachedDrag();
        if (dragState && dragState.phase === "keyboard") {
            cancelKeyboardMove();
        }
        if (oe.button !== 0 || !isValidPointerInput(oe)) {
            return;
        }
        if (clickSuppression !== null && clickSuppression.element === itemElement[0]) {
            clickSuppression = null;
        }
        if (pendingMove || dragState) {
            return;
        }
        eventObj.preventDefault();
        if (typeof itemElement[0].setPointerCapture !== "function") {
            QCD.debug("Gantt item press ignored: pointer " + oe.pointerId
                + " cannot be captured: the item has no setPointerCapture method");
            return;
        }
        try {
            itemElement[0].setPointerCapture(oe.pointerId);
        } catch (captureError) {
            QCD.debug("Gantt item press ignored: pointer " + oe.pointerId + " cannot be captured: " + captureError);
            return;
        }
        if (itemElement[0].hasPointerCapture && !itemElement[0].hasPointerCapture(oe.pointerId)) {
            QCD.debug("Gantt item press ignored: pointer " + oe.pointerId + " is not captured by the item");
            return;
        }
        dragState = {
            phase: "pending",
            pointerId: oe.pointerId,
            element: itemElement,
            item: item,
            originRow: item.row,
            originIndex: currentCellSettings.rows.indexOf(item.row),
            preDragLeft: itemElement.css("left"),
            preDragTop: itemElement.css("top"),
            startX: oe.clientX,
            startY: oe.clientY,
            startContentX: oe.clientX - htmlElements.rowsContainer[0].getBoundingClientRect().left,
            lastPoint: {clientX: oe.clientX, clientY: oe.clientY},
            dateFrom: item.info.dateFrom,
            dateTo: item.info.dateTo,
            hoursInterval: _this.options.zoomHoursIntervals[header.getCurrentParameters().scale],
            targetDate: null,
            targetRow: null
        };
    }

    /** Records the pointer, starts a drag past DRAG_THRESHOLD_PX and updates the target. */
    function onDragMove(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (!isTrackedPointer(oe)) {
            return;
        }
        if (!isValidPointerInput(oe)) {
            abandonDrag();
            return;
        }
        dragState.lastPoint = {clientX: oe.clientX, clientY: oe.clientY};
        if (dragState.phase === "pending") {
            if (Math.abs(oe.clientX - dragState.startX) < moveTransform.DRAG_THRESHOLD_PX
                    && Math.abs(oe.clientY - dragState.startY) < moveTransform.DRAG_THRESHOLD_PX) {
                return;
            }
            dragState.phase = "active";
            setItemDragging(dragState.element, true);
            ganttTooltip.hide();
        }
        updateDragTarget(oe);
    }

    /** Returns the rows content, visible pane and cell rectangles of the drop area. */
    function readDropArea() {
        var wrapperElement = htmlElements.rowsContainerWrapper[0],
            wrapperRect = wrapperElement.getBoundingClientRect(),
            rowsRect = htmlElements.rowsContainer[0].getBoundingClientRect();
        return {
            rowsRect: rowsRect,
            visibleRect: {
                left: wrapperRect.left,
                top: wrapperRect.top,
                right: wrapperRect.left + wrapperElement.clientWidth,
                bottom: wrapperRect.top + wrapperElement.clientHeight
            },
            contentRect: {
                left: rowsRect.left,
                top: rowsRect.top,
                right: rowsRect.left + getTotalNumberOfCells(currentCellSettings) * constants.CELL_WIDTH,
                bottom: rowsRect.top + currentCellSettings.rows.length * constants.CELL_HEIGHT
            }
        };
    }

    /** Builds the tooltip body of a drag outside the drop area. */
    function getReleaseToCancelBody() {
        return "<div class='ganttItemDescriptionInfo'>" + (_this.options.translations["move.releaseToCancel"] || "") + "</div>";
    }

    /** Sets the drag target and tooltip at a point, none outside the drop area; true inside. */
    function updateDragTarget(point) {
        var dropArea = readDropArea(),
            isInsideDropArea = moveTransform.isValidDropPoint({x: point.clientX, y: point.clientY}, dropArea.visibleRect,
                dropArea.contentRect),
            contentY = point.clientY - dropArea.rowsRect.top,
            contentDeltaX = (point.clientX - dropArea.rowsRect.left) - dragState.startContentX,
            date = null,
            row = null,
            body;
        if (isInsideDropArea) {
            date = moveTransform.toDropDate(dragState.dateFrom, contentDeltaX, dragState.hoursInterval, constants.CELL_WIDTH, _this.options.moveGridMinutes);
            row = moveTransform.resolveDropRow(contentY, constants.CELL_HEIGHT, currentCellSettings.rows);
        }
        if (date === dragState.targetDate && row === dragState.targetRow) {
            if (ganttTooltip.moveTo(point.clientX, point.clientY)) {
                return isInsideDropArea;
            }
        }
        dragState.targetDate = date;
        dragState.targetRow = row;

        body = isInsideDropArea ? getDragTargetBody(row, date) : getReleaseToCancelBody();
        ganttTooltip.setBody(body, "status");
        ganttTooltip.show(point.clientX, point.clientY, body);

        if (!isInsideDropArea) {
            dragState.element.css("left", dragState.preDragLeft);
            dragState.element.css("top", dragState.preDragTop);
            return false;
        }
        dragState.element.css("left", (parseFloat(dragState.preDragLeft) + moveTransform.toPixelDelta(dragState.dateFrom, date, dragState.hoursInterval, constants.CELL_WIDTH)) + "px");
        if (row !== null) {
            var targetIndex = Math.floor(contentY / constants.CELL_HEIGHT);
            dragState.element.css("top", (1 + (targetIndex - dragState.originIndex) * constants.CELL_HEIGHT) + "px");
        }
        return true;
    }

    /** Ends the press on release: a drag sends its target, or restores the item for an invalid drop. */
    function endDrag(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (!isTrackedPointer(oe)) {
            return;
        }
        if (!isValidPointerInput(oe)) {
            abandonDrag();
            return;
        }
        if (dragState.phase === "pending") {
            dragState = null;
            return;
        }

        var isDropPointValid = updateDragTarget(oe);
        ganttTooltip.hide();
        clickSuppression = {
            element: dragState.element[0],
            expiresAt: new Date().getTime() + constants.CLICK_SUPPRESSION_MS
        };

        var isTargetMissing = dragState.targetRow === null || dragState.targetDate === null;
        var isTargetUnchanged = dragState.targetDate === dragState.dateFrom && dragState.targetRow === dragState.originRow;
        if (!isDropPointValid || isTargetMissing || isTargetUnchanged) {
            restoreDraggedItem();
            return;
        }

        sendMove(null);
    }

    /** Dismisses any rejection, blocks the chart, records the pending move and sends moveItem. */
    function sendMove(focusItemId) {
        dismissRejection();
        ganttTooltip.announce("", "status");
        QCD.components.elements.utils.LoadingIndicator.blockElement(element);
        pendingMove = {
            element: dragState.element,
            preDragLeft: dragState.preDragLeft,
            preDragTop: dragState.preDragTop,
            itemId: dragState.item.id
        };
        focusAfterMoveItemId = focusItemId;
        var args = moveTransform.buildMoveArgs(dragState.item, dragState.targetRow, dragState.targetDate);
        dragState = null;
        var moveRequest = callMoveEvent(args);
        if (moveRequest !== null) {
            moveRequest.fail(onMoveComplete);
        }
    }

    /** Calls the moveItem event and returns its jqXHR, or null when no request was sent. */
    function callMoveEvent(args) {
        var moveRequest = null;
        var captureMoveRequest = function (event, jqXHR, settings) {
            if (moveRequest === null && settings && isMoveRequestData(settings.data, args)) {
                moveRequest = jqXHR;
            }
        };
        $(document).bind("ajaxSend", captureMoveRequest);
        try {
            mainController.callEvent("moveItem", _this.elementPath, onMoveComplete, args);
        } finally {
            $(document).unbind("ajaxSend", captureMoveRequest);
        }
        return moveRequest;
    }

    /** Returns whether request data is the JSON of a moveItem event with these arguments. */
    function isMoveRequestData(data, args) {
        var parameters;
        if (typeof data !== "string") {
            return false;
        }
        try {
            parameters = JSON.parse(data);
        } catch (parseError) {
            return false;
        }
        return parameters !== null && typeof parameters === "object" && parameters.event !== null
            && typeof parameters.event === "object" && parameters.event.name === "moveItem"
            && $.isArray(parameters.event.args) && parameters.event.args[0] === args[0];
    }

    /** After the current call stack, restores the item and unblocks the chart when its move is still pending. */
    function onMoveComplete() {
        setTimeout(function () {
            if (pendingMove) {
                restoreItemPosition(pendingMove);
                pendingMove = null;
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
            }
        }, 0);
    }

    /** Cancels the press or drag of the event's pointer and hides the tooltip. */
    function cancelDrag(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (!dragState || oe.pointerId !== dragState.pointerId) {
            return;
        }
        restoreDraggedItem();
        ganttTooltip.hide();
    }

    function onLostPointerCapture(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (dragState && oe.pointerId === dragState.pointerId) {
            cancelDrag(eventObj);
        }
    }

    /** Restores the stored left and top of the state's element and ends its drag layer. */
    function restoreItemPosition(state) {
        state.element.css("left", state.preDragLeft);
        state.element.css("top", state.preDragTop);
        setItemDragging(state.element, false);
    }

    /** Toggles ganttItemDragging and updates the item's layer and focus ring. */
    function setItemDragging(itemElement, isDragging) {
        itemElement.toggleClass("ganttItemDragging", isDragging);
        updateItemLayer(itemElement);
        updateItemFocusRing(itemElement);
    }

    /** Sets the z-index of a dragged or :focus-visible focused item, clearing it on others. */
    function updateItemLayer(itemElement) {
        var itemNode = itemElement[0];
        if (!itemNode) {
            return;
        }
        if (itemElement.hasClass("ganttItemDragging")) {
            itemElement.css("z-index", constants.DRAGGING_ITEM_Z_INDEX);
        } else if (itemNode === focusedItemNode && matchesFocusVisible(itemNode)) {
            itemElement.css("z-index", constants.FOCUSED_ITEM_Z_INDEX);
        } else {
            itemElement.css("z-index", "");
        }
    }

    /** Restores the dragged item, announces a cancellation and clears the drag state. */
    function restoreDraggedItem() {
        if (dragState) {
            restoreItemPosition(dragState);
            announceCancelledMove(dragState);
        }
        dragState = null;
    }

    /** Ends any press, drag or keyboard move without an event and hides the tooltip. */
    function abandonDrag() {
        if (!dragState) {
            return;
        }
        var itemNode = dragState.element[0];
        if (dragState.pointerId !== null && itemNode && itemNode.hasPointerCapture && itemNode.releasePointerCapture
                && itemNode.hasPointerCapture(dragState.pointerId)) {
            itemNode.releasePointerCapture(dragState.pointerId);
        }
        restoreItemPosition(dragState);
        ganttTooltip.hide();
        announceCancelledMove(dragState);
        dragState = null;
    }

    /** Announces that an active drag or keyboard move ended without a request. */
    function announceCancelledMove(state) {
        if (state.phase !== "pending") {
            ganttTooltip.announce(_this.options.translations["move.cancelledAnnouncement"] || "", "status");
        }
    }

    function discardDetachedDrag() {
        if (dragState && !$.contains(document.documentElement, dragState.element[0])) {
            abandonDrag();
        }
    }

    function isTrackedPointer(oe) {
        discardDetachedDrag();
        return dragState !== null && oe.pointerId === dragState.pointerId;
    }

    function isFiniteNumber(value) {
        return typeof value === "number" && isFinite(value);
    }

    /** Returns whether a pointer event has a 32-bit integer pointer id and finite client coordinates. */
    function isValidPointerInput(oe) {
        return isFiniteNumber(oe.pointerId) && oe.pointerId % 1 === 0 && oe.pointerId >= -2147483648
            && oe.pointerId <= 2147483647 && isFiniteNumber(oe.clientX) && isFiniteNumber(oe.clientY);
    }

    /** Returns true, ending the suppression, for a click on the dragged item before it expires. */
    function consumeClickSuppression(itemNode) {
        if (clickSuppression === null) {
            return false;
        }
        if (new Date().getTime() >= clickSuppression.expiresAt) {
            clickSuppression = null;
            return false;
        }
        if (clickSuppression.element !== itemNode) {
            return false;
        }
        clickSuppression = null;
        return true;
    }

    function createStripElement(strip) {
        var stripElement = $("<div>").addClass("ganttItemStrip");
        if (stripsOrientation == 'vertical') {
            stripElement.addClass("verticalStrip");
            stripElement.css("height", strip.size + '%');
        } else {
            stripElement.addClass("horizontalStrip");
            stripElement.css("width", strip.size + '%');
        }
        stripElement.css("background-color", strip.color);
        return stripElement;
    }

    this.updateSize = function (_width, _height) {
        _width = _width - 22;
        _height = _height - 50;
        currentWidth = _width;
        htmlElements.wrapper.width(_width);
        htmlElements.wrapper.height(_height);
        var centerAreaWidth = _width - constants.ROW_NAMES_WIDTH;
        var topRowWidth = centerAreaWidth;
        if (isVScrollVisible) {
            topRowWidth = topRowWidth - constants.RIGHT_SCROLL_WIDTH - 1;
        }
        htmlElements.centerContainer.width(centerAreaWidth);
        htmlElements.topRow.width(topRowWidth);
        htmlElements.rowsContainerWrapper.width(centerAreaWidth);

        htmlElements.centerContainer.height(_height);
        htmlElements.rowNamesConteiner.height(_height - constants.HEADER_HEIGHT - constants.BOTTOM_SCROLL_HEIGHT);
        htmlElements.rowsContainerWrapper.height(_height - constants.HEADER_HEIGHT);// - constants.BOTTOM_SCROLL_HEIGHT - 2);
        updateScroll();
    };

    function updateScroll() {
        setVerticalScrollVisible(rowsByIndex.length * constants.CELL_HEIGHT > htmlElements.rowsContainerWrapper.height());
        setHorizontalScrollVisible(htmlElements.rowsContainer.width() > htmlElements.rowsContainerWrapper.width());
    }

    constructor();
};

/** Inline CSS map that hides an element visually while keeping it in the accessibility tree. */
QCD.components.elements.GanttChartVisuallyHiddenStyle = {
    "position": "absolute",
    "width": "1px",
    "height": "1px",
    "margin": "-1px",
    "padding": "0",
    "border": "0",
    "overflow": "hidden",
    "clip": "rect(0 0 0 0)",
    "white-space": "nowrap",
    "pointer-events": "none"
};

QCD.components.elements.GanttChartTooltip = function (_element) {

    var element = _element;

    var visible = false;

    var htmlElements = {};

    // Live regions by role, the size moveTo measured and the move layout flag.
    var liveRegions = null,
        measuredSize = null,
        moveLayout = false;

    // Move layout styles: stylesheet z-index, no pointer events, wrapped words.
    var moveLayoutStyle = {
        "z-index": "",
        "pointer-events": "none",
        "overflow-wrap": "anywhere",
        "word-break": "break-word"
    };

    // Owner and first body node that showFor recorded, or null.
    var bodyOwner = null;

    function constructor() {
        createTooltip();
    }

    function createTooltip() {
        htmlElements.tooltipElement = $("<div>").addClass("ganttChartTooltip");
        htmlElements.tooltipElement.css("opacity", "0");
        htmlElements.tooltipElement.css("position", "fixed");
        htmlElements.tooltipElement.css("z-index", "100");
        htmlElements.tooltipElement.css("top", "-1000px");

        htmlElements.tooltipBodyWrapper = $("<div>").addClass("ganttChartTooltipBody");

        htmlElements.tooltipElement.append(htmlElements.tooltipBodyWrapper);
        element.append(htmlElements.tooltipElement);
    }

    /** Appends a visually hidden, atomic live region to the chart element. */
    function createLiveRegion(role, politeness) {
        var region = $("<div>").addClass("ganttChartLiveRegion");
        region.attr({
            "role": role,
            "aria-live": politeness,
            "aria-atomic": "true"
        });
        region.css(QCD.components.elements.GanttChartVisuallyHiddenStyle);
        element.append(region);
        return region;
    }

    /** Appends the polite status and assertive alert live regions once. */
    this.enableLiveFeedback = function () {
        if (liveRegions) {
            return;
        }
        liveRegions = {
            status: createLiveRegion("status", "polite"),
            alert: createLiveRegion("alert", "assertive")
        };
    };

    /** Applies moveLayoutStyle once; measurements then use the border box at left 0. */
    this.enableMoveLayout = function () {
        if (moveLayout) {
            return;
        }
        moveLayout = true;
        htmlElements.tooltipElement.css(moveLayoutStyle);
    };

    /** Replaces the tooltip body and writes its text to the "status" or "alert" live region named by liveRole. */
    this.setBody = function (body, liveRole) {
        htmlElements.tooltipBodyWrapper.html(body);
        if (liveRegions && Object.prototype.hasOwnProperty.call(liveRegions, liveRole)) {
            liveRegions[liveRole].empty().append($("<div>").text(getBodyText()));
        }
    };

    /** Replaces the content of the "status" or "alert" live region with a text. */
    this.announce = function (text, liveRole) {
        if (!liveRegions || !Object.prototype.hasOwnProperty.call(liveRegions, liveRole)) {
            return;
        }
        liveRegions[liveRole].empty();
        if (text !== null && text !== undefined && String(text).length > 0) {
            liveRegions[liveRole].append($("<div>").text(String(text)));
        }
    };

    /** Shows an owner's body, replacing another owner's, and records the owner. */
    this.showFor = function (owner, x, y, body, anchor) {
        if (visible && !this.isShowing(owner)) {
            htmlElements.tooltipBodyWrapper.html(body);
        }
        this.show(x, y, body, anchor);
        bodyOwner = {
            owner: owner,
            node: htmlElements.tooltipBodyWrapper[0].firstChild
        };
    };

    /** Returns whether the visible tooltip still shows the owner's showFor body. */
    this.isShowing = function (owner) {
        return visible && owner !== null && owner !== undefined && bodyOwner !== null && bodyOwner.owner === owner
            && bodyOwner.node !== null && bodyOwner.node === htmlElements.tooltipBodyWrapper[0].firstChild;
    };

    /** Moves the visible tooltip to a pointer, measuring each body once; false when hidden. */
    this.moveTo = function (x, y) {
        if (!visible) {
            return false;
        }
        var bodyNode = htmlElements.tooltipBodyWrapper[0].firstChild,
            position;
        if (!measuredSize || measuredSize.bodyNode !== bodyNode) {
            measuredSize = measureTooltip();
            measuredSize.bodyNode = bodyNode;
        }
        position = calculatePosition(x, y, measuredSize);
        htmlElements.tooltipElement.css("left", position.x).css("top", position.y);
        return true;
    };

    /** Shows the tooltip at a point or anchor, writing the body only while hidden. */
    this.show = function (x, y, body, anchor) {
        if (!visible) {
            htmlElements.tooltipBodyWrapper.html(body);
        }
        var position = calculatePosition(x, y, undefined, anchor);
        htmlElements.tooltipElement.css("left", position.x).css("top", position.y);
        if (!visible) {
            visible = true;
            htmlElements.tooltipElement.animate({
                opacity: 0.8
            }, {
                duration: 100,
                queue: false
            });
        }
    };

    this.hide = function () {
        htmlElements.tooltipElement.stop().css("opacity", "0.0").css("top", "-1000px");
        visible = false;
    };

    /** Returns the tooltip's content size, or its border box at left 0 with the move layout. */
    function measureTooltip() {
        if (!moveLayout) {
            return {
                width: htmlElements.tooltipElement.width(),
                height: htmlElements.tooltipElement.height()
            };
        }
        htmlElements.tooltipElement.css("left", "0px");
        var rect = htmlElements.tooltipElement[0].getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height
        };
    }

    /** Returns the position 20 px below the point or anchor, or above near the bottom, within margins. */
    function calculatePosition(x, y, size, anchor) {
        var spacing = {
            top: 20,
            right: 40,
            bottom: 20,
            left: 20
        };

        var windowWidth = $(window).width();
        var windowHeight = $(window).height();

        var tooltipSize = size || measureTooltip();
        var tooltipWidth = tooltipSize.width;
        var tooltipHeight = tooltipSize.height;

        var calcX = x - (tooltipWidth / 2);
        var calcY = (anchor ? anchor.bottom : y) + 20;

        if (calcX < spacing.left) {
            calcX = spacing.left;
        } else if (calcX + tooltipWidth > windowWidth - spacing.right) {
            calcX = windowWidth - tooltipWidth - spacing.right;
        }

        if (calcY + tooltipHeight > windowHeight - spacing.bottom) {
            calcY = (anchor ? anchor.top : y) - tooltipHeight - 20;
        }

        return {
            x: calcX,
            y: calcY
        }
    }

    function getBodyText() {
        var parts = [];
        collectTextNodes(htmlElements.tooltipBodyWrapper[0], parts);
        return parts.join(" ");
    }

    /** Appends the trimmed, non-empty texts of the text nodes below a node to parts. */
    function collectTextNodes(node, parts) {
        var child, text;
        for (child = node.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 3) {
                text = $.trim(child.nodeValue);
                if (text.length > 0) {
                    parts.push(text);
                }
            } else if (child.nodeType === 1) {
                collectTextNodes(child, parts);
            }
        }
    }

    constructor();
};
