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

/**
 * Stateless calculations of Gantt item moves: wall-clock dates, 30-minute grid snapping, pixel and date conversion, drop
 * target resolution, drag eligibility, HTML escaping and moveItem event arguments. Dates are "yyyy-MM-dd HH:mm:ss" wall-clock
 * strings; wall-clock minutes count minutes from 1970-01-01 00:00:00 without any time zone offset.
 */
QCD.components.elements.GanttChartMoveTransform = {

    /** Pointer travel in pixels, on either axis, at which a press on a draggable item becomes a drag. */
    DRAG_THRESHOLD_PX: 4,

    /**
     * Parses a wall-clock date.
     *
     * @param text date in the "yyyy-MM-dd HH:mm:ss" format
     * @returns wall-clock minutes of the date, or null when the text is not a string in that format
     */
    parseWallClock: function (text) {
        if (typeof text !== "string") {
            return null;
        }
        var match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
        if (!match) {
            return null;
        }
        return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]),
            Number(match[6])) / 60000;
    },

    /**
     * Formats wall-clock minutes as a wall-clock date.
     *
     * @param minutes wall-clock minutes
     * @returns date in the "yyyy-MM-dd HH:mm:ss" format, or null when the value is not a finite number
     */
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
        var date = new Date(minutes * 60000);
        return pad(date.getUTCFullYear(), 4) + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2) + " "
            + pad(date.getUTCHours(), 2) + ":" + pad(date.getUTCMinutes(), 2) + ":" + pad(date.getUTCSeconds(), 2);
    },

    /**
     * Rounds minutes to the nearest multiple of the grid.
     *
     * @param minutes wall-clock minutes
     * @param grid grid step in minutes
     * @returns the nearest multiple of the grid step
     */
    snapMinutes: function (minutes, grid) {
        return Math.round(minutes / grid) * grid;
    },

    /**
     * Converts a horizontal pixel delta of a dragged item into its snapped start date.
     *
     * @param originalDateFrom start date of the item before the drag
     * @param deltaPx horizontal pointer travel in pixels, positive to the right
     * @param hoursInterval hours spanned by one chart cell at the current zoom level
     * @param cellWidth width of one chart cell in pixels
     * @param grid grid step in minutes
     * @returns snapped start date, or null when the original start date does not parse
     */
    toDropDate: function (originalDateFrom, deltaPx, hoursInterval, cellWidth, grid) {
        var start = QCD.components.elements.GanttChartMoveTransform.parseWallClock(originalDateFrom);
        if (start === null) {
            return null;
        }
        return QCD.components.elements.GanttChartMoveTransform.formatWallClock(
            QCD.components.elements.GanttChartMoveTransform.snapMinutes(start + deltaPx / cellWidth * hoursInterval * 60, grid));
    },

    /**
     * Converts the distance between two dates into a horizontal pixel delta.
     *
     * @param originalDateFrom start date of the item before the drag
     * @param targetDate target start date
     * @param hoursInterval hours spanned by one chart cell at the current zoom level
     * @param cellWidth width of one chart cell in pixels
     * @returns pixel delta, positive when the target date is later, or 0 when either date does not parse
     */
    toPixelDelta: function (originalDateFrom, targetDate, hoursInterval, cellWidth) {
        var original = QCD.components.elements.GanttChartMoveTransform.parseWallClock(originalDateFrom);
        var target = QCD.components.elements.GanttChartMoveTransform.parseWallClock(targetDate);
        if (original === null || target === null) {
            return 0;
        }
        return (target - original) / (hoursInterval * 60) * cellWidth;
    },

    /**
     * Resolves the row under a vertical position in the rows content.
     *
     * @param contentY vertical position in pixels from the top of the rows content
     * @param rowHeight height of one row in pixels
     * @param rowNames row names in display order
     * @returns name of the row at the position, or null when there are no row names or the position lies outside the rows
     */
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

    /**
     * Checks whether a point lies inside both rectangles; left and top edges are inside, right and bottom edges are outside.
     *
     * @param point point with x and y
     * @param visibleRect visible rectangle with left, top, right and bottom
     * @param contentRect content rectangle with left, top, right and bottom
     * @returns true when all three arguments are given and the point lies inside both rectangles
     */
    isValidDropPoint: function (point, visibleRect, contentRect) {
        if (!point || !visibleRect || !contentRect) {
            return false;
        }
        var isInside = function (rect) {
            return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
        };
        return isInside(visibleRect) && isInside(contentRect);
    },

    /**
     * Computes the width of one grid step.
     *
     * @param hoursInterval hours spanned by one chart cell at the current zoom level
     * @param cellWidth width of one chart cell in pixels
     * @param grid grid step in minutes
     * @returns width of one grid step in pixels
     */
    gridStepPx: function (hoursInterval, cellWidth, grid) {
        return cellWidth * grid / (hoursInterval * 60);
    },

    /**
     * Checks whether an item can be dragged.
     *
     * @param item Gantt item
     * @param isCollision whether the item is a collision item
     * @param allowItemMove whether the chart allows item moves
     * @param hoursInterval hours spanned by one chart cell at the current zoom level
     * @param cellWidth width of one chart cell in pixels
     * @param grid grid step in minutes
     * @returns true only when moves are allowed, the item is not a collision item, the item has an id, and one grid step is
     *          at least DRAG_THRESHOLD_PX wide
     */
    isDraggable: function (item, isCollision, allowItemMove, hoursInterval, cellWidth, grid) {
        if (allowItemMove !== true || isCollision || !item || !item.id) {
            return false;
        }
        return QCD.components.elements.GanttChartMoveTransform.gridStepPx(hoursInterval, cellWidth, grid)
            >= QCD.components.elements.GanttChartMoveTransform.DRAG_THRESHOLD_PX;
    },

    /**
     * Encodes a value for use as HTML text.
     *
     * @param text value to encode
     * @returns the value as a string with &, <, >, " and ' replaced by character references, or an empty string for null
     *          and undefined
     */
    escapeHtml: function (text) {
        if (text === null || text === undefined) {
            return "";
        }
        return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    /**
     * Builds the arguments of the moveItem event.
     *
     * @param item dragged Gantt item as rendered
     * @param targetRow name of the target row
     * @param dateFrom target start date
     * @returns one-element array holding the JSON payload with itemId, row, dateFrom, originalRow, originalName,
     *          originalDateFrom and originalDateTo
     */
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

    /**
     * Interprets the moveResult of a moveItem response.
     *
     * @param moveResult move result with accepted and message, or null when the response carries none
     * @returns object with snapBack, true unless the move is accepted, and message, the delivered message or null
     */
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
        // Milliseconds after the end of a drag during which a click on the dragged item is ignored.
        CLICK_SUPPRESSION_MS: 1000
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

    // Press or drag of a draggable item in progress, or null. Fields: phase ("pending" or "active"), pointerId, element,
    // item, originRow, originIndex, preDragLeft, preDragTop, startX, startY, dateFrom, dateTo, hoursInterval, targetDate
    // and targetRow.
    var dragState = null;

    // Dropped item awaiting the moveItem response, or null. Fields: element, preDragLeft, preDragTop and itemId.
    var pendingMove = null;

    // Click to ignore after a drag, or null. Fields: element, the DOM element of the dragged item, and expiresAt, the
    // time in milliseconds until which a click on that element is ignored.
    var clickSuppression = null;

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
                // Rejected move: restores the dropped item, shows the reason next to it and leaves the chart unchanged. A missing
                // header translation or message renders as an empty string.
                var movedItemElement = pendingMove ? pendingMove.element : $("#" + _this.elementSearchName + "_item_" + value.moveResult.itemId);
                if (pendingMove) {
                    restoreItemPosition(pendingMove);
                }
                ganttTooltip.hide();
                var rejectionBody = "<div class='ganttItemDescriptionName'>" + (_this.options.translations["move.rejectedHeader"] || "") + "</div>"
                    + "<div class='ganttItemDescriptionInfo'>" + (outcome.message || "") + "</div>";
                var anchorRect = (movedItemElement.length > 0 ? movedItemElement[0] : element[0]).getBoundingClientRect();
                ganttTooltip.setBody(rejectionBody, "alert");
                ganttTooltip.show((anchorRect.left + anchorRect.right) / 2, anchorRect.bottom, rejectionBody);
                pendingMove = null;
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
                return;
            }
            if (value.moveResult.reloadRequired === true) {
                // Accepted move delivered without its chart: keeps the dropped item at its drop position, hides the tooltip,
                // shows the move result's message as an information message that stays until it is closed, and unblocks
                // the chart without sending another event. A missing message renders as an empty string.
                if (pendingMove) {
                    pendingMove.element.removeClass("ganttItemDragging");
                    pendingMove = null;
                }
                ganttTooltip.hide();
                mainController.showMessage({
                    type: "info",
                    content: value.moveResult.message || "",
                    autoClose: false
                });
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
                return;
            }
            // Accepted move: restores the dropped item before the chart is rebuilt from the response.
            if (pendingMove) {
                restoreItemPosition(pendingMove);
                pendingMove = null;
            }
        }
        applySettings(value);
        header.enableButtons();
        header.setDateFromValue(value.dateFrom, value.dateFromErrorMessage);
        header.setDateToValue(value.dateTo, value.dateToErrorMessage);
        header.setDateToValue(value.dateTo, value.dateToErrorMessage);
        header.setGlobalErrorMessage(value.globalErrorMessage);
        if (value.selectedEntityId) {
            if (selectedItem) {
                selectedItem.removeClass("ganttItemSelected");
            }
            var newSelectedItem = $("#" + _this.elementSearchName + "_item_" + value.selectedEntityId);
            selectedItem = newSelectedItem;
            newSelectedItem.addClass("ganttItemSelected");
        }
        collisionInfoBoxOverlay.hide();
        // While a dropped item awaits the moveItem response, the chart stays blocked.
        if (!pendingMove) {
            QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
        }
    };

    // A press or drag in progress ends without an event before the chart requests new content or shows its loading
    // indicator.
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
            // While a dropped item awaits the moveItem response, the chart stays blocked; the header buttons are
            // enabled.
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

        // A press or drag in progress ends before its item is removed. On charts that allow item moves, the tooltip is
        // hidden as well.
        abandonDrag();
        if (_this.options.allowItemMove === true) {
            ganttTooltip.hide();
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

    /**
     * Points the pending move, if any, at the rendered element of its item, or at an empty set when the chart shows no
     * such item, and takes that element's current left and top as the position the move restores.
     */
    function rebindPendingMove() {
        if (!pendingMove) {
            return;
        }
        var mountedItemElement = $("#" + _this.elementSearchName + "_item_" + pendingMove.itemId);
        pendingMove.element = mountedItemElement;
        pendingMove.preDragLeft = mountedItemElement.css("left");
        pendingMove.preDragTop = mountedItemElement.css("top");
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

    /**
     * Returns the hours spanned by one chart cell at the current zoom level of the header, on charts that allow item moves.
     *
     * @returns the zoomHoursIntervals option entry of the current header scale, or undefined, without reading the header,
     *          when the chart does not allow item moves or has no zoomHoursIntervals option
     */
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
                    selectedItem.removeClass("ganttItemSelected");
                    $("#" + _this.elementSearchName + "_collisionItem_" + selectedItem[0].entityId).removeClass("ganttItemSelected");
                }
                var ganttElement = $("#" + _this.elementSearchName + "_item_" + itemId);
                selectedItem = ganttElement;
                itemElement.addClass("ganttItemSelected");
                ganttElement.addClass("ganttItemSelected");
                onSelectChange();
                // On charts that allow item moves, choosing an entry also closes the collision box.
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
    }

    function createGanttTooltip() {
        ganttTooltip = new QCD.components.elements.GanttChartTooltip(element);
        // On charts that allow item moves, the tooltip also gets the live regions that announce drag targets and rejections.
        if (_this.options.allowItemMove === true) {
            ganttTooltip.enableLiveFeedback();
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
        if (visible) {
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

    function addRow(cellSettings, rowName) {
        var rowNameElement = $("<div>").height(constants.CELL_HEIGHT - 1).addClass("ganttRowNameElement");
        rowNameElement.css("line-height", (constants.CELL_HEIGHT - 1) + "px");
        // On charts that allow item moves, the row name is rendered as text; otherwise as HTML.
        if (_this.options.allowItemMove === true) {
            rowNameElement.text(rowName);
        } else {
            rowNameElement.html(rowName);
        }
        htmlElements.rowNamesConteiner.append(rowNameElement);

        var rowElement = $("<div>").height(constants.CELL_HEIGHT - 1).addClass("ganttRowElement");
        htmlElements.rowsContainer.append(rowElement);

        for (var i = 0; i < cellSettings.scale.categories.length; i++) {
            var categoryCellsNumber = getCategoryCellsNumber(cellSettings, i);
            var cellElement;
            for (var bottomI = 0; bottomI < categoryCellsNumber; bottomI++) {
                cellElement = $("<div>").height(constants.CELL_HEIGHT - 1).width(constants.CELL_WIDTH - 1).addClass("ganttCellElement");
                cellElement.attr("id", "ganttCellElement_" + i + "_" + bottomI);
                rowElement.append(cellElement);
            }
            cellElement.addClass("ganttTopRowElementEnd");
        }
        rowsByName[rowName] = rowElement;
        return rowElement;
    }

    /**
     * Renders a Gantt item in its row and binds its selection, hover tooltip and, when it is draggable, pointer drag
     * handlers.
     *
     * @param item Gantt item
     * @param isCollision whether the item is a collision item
     * @param moveHoursInterval hours spanned by one chart cell at the current zoom level on charts that allow item moves,
     *                          as returned by getMoveHoursInterval; undefined leaves the item without a drag affordance
     */
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
            if (width > 30) {
                itemElement.addClass("withIcon");
                itemElementContent.html(_this.options.translations["colisionElementName"]);
                itemElementContent.shorten({width: width, tail: "...", tooltip: false});
            } else if (width > 15) {
                itemElement.addClass("withIcon");
            }
            itemElement[0].isCollision = true; // add isCollision to DOM element
            itemElement[0].ganttItem = item; // add item element to DOM
        } else {
            if (width > 30) {
                itemElementContent.html(item.info.name);
                itemElementContent.shorten({width: width, tail: "...", tooltip: false});
            }
        }
        itemElement.append(itemElementContent);

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

        if (_this.options.hasPopupInfo) {
            itemElement.bind({
                "mousemove": function (eventObj) {
                    if (dragState && dragState.phase === "active") {
                        return;
                    }
                    ganttTooltip.show(eventObj.clientX, eventObj.clientY, createTooltipContent(item));
                },
                "mouseleave": function (eventObj) {
                    if (dragState && dragState.phase === "active") {
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
            itemElement.click(function () {
                if (consumeClickSuppression(this)) {
                    return;
                }
                if (this.isCollision) {
                    showCollisionBox(this.ganttItem);
                    return;
                }
                var itemElement = $(this);
                if (selectedItem) {
                    selectedItem.removeClass("ganttItemSelected");
                }
                selectedItem = itemElement;
                itemElement.addClass("ganttItemSelected");
                onSelectChange();
            });
        }

        // Draggable items get the ganttItemDraggable class, the move cursor and the pointer drag handlers.
        if (moveTransform.isDraggable(item, isCollision, _this.options.allowItemMove, moveHoursInterval, constants.CELL_WIDTH, _this.options.moveGridMinutes)) {
            itemElement.addClass("ganttItemDraggable");
            itemElement.css("cursor", "move");
            itemElement.bind({
                "pointerdown": function (eventObj) {
                    startPress(eventObj, item, itemElement);
                },
                "pointermove": onDragMove,
                "pointerup": endDrag,
                "pointercancel": cancelDrag,
                "lostpointercapture": onLostPointerCapture
            });
        }

        itemElement.mouseover(function () {
            $(this).addClass("ganttItemHovered");
        }).mouseout(function () {
            $(this).removeClass("ganttItemHovered");
        });
    }

    /**
     * Starts a pending press of a draggable item with the primary button: captures the pointer on the item and records the
     * item's position, row, dates and the pointer start. Every pointerdown first discards a press or drag whose item is
     * no longer in the document. A primary-button pointerdown with valid pointer input on the item of the click
     * suppression ends that suppression. Ignored for any other button, for a pointerdown without an integral pointer id
     * and finite coordinates, while a press, drag or move request is in progress, and when the item cannot capture the
     * pointer.
     *
     * @param eventObj pointerdown event
     * @param item pressed Gantt item
     * @param itemElement element of the pressed item
     */
    function startPress(eventObj, item, itemElement) {
        var oe = eventObj.originalEvent || eventObj;
        discardDetachedDrag();
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
        if (itemElement[0].setPointerCapture) {
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
            dateFrom: item.info.dateFrom,
            dateTo: item.info.dateTo,
            hoursInterval: _this.options.zoomHoursIntervals[header.getCurrentParameters().scale],
            targetDate: null,
            targetRow: null
        };
    }

    /**
     * Follows the pointer of the current press. A pending press becomes an active drag once the pointer has travelled
     * DRAG_THRESHOLD_PX on either axis; the item then gets the ganttItemDragging class and the hover tooltip is hidden. An
     * active drag moves the item to the snapped target. A pointermove of the tracked pointer without finite coordinates
     * abandons the press or drag.
     *
     * @param eventObj pointermove event
     */
    function onDragMove(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (!isTrackedPointer(oe)) {
            return;
        }
        if (!isValidPointerInput(oe)) {
            abandonDrag();
            return;
        }
        if (dragState.phase === "pending") {
            if (Math.abs(oe.clientX - dragState.startX) < moveTransform.DRAG_THRESHOLD_PX
                    && Math.abs(oe.clientY - dragState.startY) < moveTransform.DRAG_THRESHOLD_PX) {
                return;
            }
            dragState.phase = "active";
            dragState.element.addClass("ganttItemDragging");
            ganttTooltip.hide();
        }
        updateDragTarget(oe);
    }

    /**
     * Resolves the snapped date and the row under the pointer of the current drag; the position of the rows content is
     * read before anything is written. When the date or the row differs from the stored drag target, or the tooltip is
     * hidden, stores both as the drag target, writes the target row and date to the tooltip body and its status live
     * region, shows the tooltip at the pointer, and then places the dragged item at the snapped date and, when the pointer
     * is over a row, in that row. Otherwise only moves the visible tooltip to the pointer, leaving the item and the
     * tooltip body unchanged.
     *
     * @param oe native pointer event
     */
    function updateDragTarget(oe) {
        var contentY = oe.clientY - htmlElements.rowsContainer[0].getBoundingClientRect().top,
            date = moveTransform.toDropDate(dragState.dateFrom, oe.clientX - dragState.startX, dragState.hoursInterval, constants.CELL_WIDTH, _this.options.moveGridMinutes),
            row = moveTransform.resolveDropRow(contentY, constants.CELL_HEIGHT, currentCellSettings.rows);
        if (date === dragState.targetDate && row === dragState.targetRow) {
            if (ganttTooltip.moveTo(oe.clientX, oe.clientY)) {
                return;
            }
        }
        dragState.targetDate = date;
        dragState.targetRow = row;

        // A missing row or date renders as an empty string, and so does a missing dateFrom label translation.
        var body = "<div class='ganttItemDescriptionName'>" + moveTransform.escapeHtml(row) + "</div>"
            + "<div class='ganttItemDescriptionInfo'><div class='ganttItemDescriptionLabel'>" + (_this.options.translations["description.dateFrom"] || "") + "</div>"
            + "<div class='ganttItemDescriptionValue'>" + moveTransform.escapeHtml(date) + "</div></div>";
        ganttTooltip.setBody(body, "status");
        ganttTooltip.show(oe.clientX, oe.clientY, body);

        dragState.element.css("left", (parseFloat(dragState.preDragLeft) + moveTransform.toPixelDelta(dragState.dateFrom, date, dragState.hoursInterval, constants.CELL_WIDTH)) + "px");
        if (row !== null) {
            // Index of the row under the pointer, derived from contentY as resolveDropRow derives it.
            var targetIndex = Math.floor(contentY / constants.CELL_HEIGHT);
            dragState.element.css("top", (1 + (targetIndex - dragState.originIndex) * constants.CELL_HEIGHT) + "px");
        }
    }

    /**
     * Ends the current press on pointer release. A pending press ends without a move, leaving the click to select the item.
     * An active drag hides the tooltip, ignores the next click on the dragged item for constants.CLICK_SUPPRESSION_MS
     * or until the next primary-button pointerdown on that item, and either restores the item, when the drop point lies
     * outside the visible rows content, the target is incomplete, or the target equals the original row and date, or
     * blocks the chart and sends the moveItem event with the target. A pointerup of the tracked pointer without finite
     * coordinates abandons the press or drag without sending an event.
     *
     * @param eventObj pointerup event
     */
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

        updateDragTarget(oe);
        ganttTooltip.hide();
        clickSuppression = {
            element: dragState.element[0],
            expiresAt: new Date().getTime() + constants.CLICK_SUPPRESSION_MS
        };

        var wrapperElement = htmlElements.rowsContainerWrapper[0];
        var wrapperRect = wrapperElement.getBoundingClientRect();
        var visibleRect = {
            left: wrapperRect.left,
            top: wrapperRect.top,
            right: wrapperRect.left + wrapperElement.clientWidth,
            bottom: wrapperRect.top + wrapperElement.clientHeight
        };
        var rowsRect = htmlElements.rowsContainer[0].getBoundingClientRect();
        var contentRect = {
            left: rowsRect.left,
            top: rowsRect.top,
            right: rowsRect.left + getTotalNumberOfCells(currentCellSettings) * constants.CELL_WIDTH,
            bottom: rowsRect.top + currentCellSettings.rows.length * constants.CELL_HEIGHT
        };

        var isDropPointValid = moveTransform.isValidDropPoint({x: oe.clientX, y: oe.clientY}, visibleRect, contentRect);
        var isTargetMissing = dragState.targetRow === null || dragState.targetDate === null;
        var isTargetUnchanged = dragState.targetDate === dragState.dateFrom && dragState.targetRow === dragState.originRow;
        if (!isDropPointValid || isTargetMissing || isTargetUnchanged) {
            restoreDraggedItem();
            return;
        }

        QCD.components.elements.utils.LoadingIndicator.blockElement(element);
        pendingMove = {
            element: dragState.element,
            preDragLeft: dragState.preDragLeft,
            preDragTop: dragState.preDragTop,
            itemId: dragState.item.id
        };
        var args = moveTransform.buildMoveArgs(dragState.item, dragState.targetRow, dragState.targetDate);
        dragState = null;
        mainController.callEvent("moveItem", _this.elementPath, onMoveComplete, args);
    }

    /**
     * Runs when the moveItem request completes. After the current call stack, restores the dropped item and unblocks the
     * chart when no moveResult has been handled for the move.
     */
    function onMoveComplete() {
        setTimeout(function () {
            if (pendingMove) {
                restoreItemPosition(pendingMove);
                pendingMove = null;
                QCD.components.elements.utils.LoadingIndicator.unblockElement(element);
            }
        }, 0);
    }

    /**
     * Cancels the current press or drag of the same pointer: restores the item and hides the tooltip without sending an
     * event.
     *
     * @param eventObj pointercancel or lostpointercapture event
     */
    function cancelDrag(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (!dragState || oe.pointerId !== dragState.pointerId) {
            return;
        }
        restoreDraggedItem();
        ganttTooltip.hide();
    }

    /**
     * Cancels the current press or drag when the item loses the capture of its pointer before the pointer is released.
     *
     * @param eventObj lostpointercapture event
     */
    function onLostPointerCapture(eventObj) {
        var oe = eventObj.originalEvent || eventObj;
        if (dragState && oe.pointerId === dragState.pointerId) {
            cancelDrag(eventObj);
        }
    }

    /**
     * Returns an item to its position before the drag and removes the ganttItemDragging class.
     *
     * @param state drag state or pending move holding element, preDragLeft and preDragTop
     */
    function restoreItemPosition(state) {
        state.element.css("left", state.preDragLeft);
        state.element.css("top", state.preDragTop);
        state.element.removeClass("ganttItemDragging");
    }

    /**
     * Returns the item of the current press or drag to its position before the drag and clears the drag state.
     */
    function restoreDraggedItem() {
        if (dragState) {
            restoreItemPosition(dragState);
        }
        dragState = null;
    }

    /**
     * Ends the current press or drag, if any, without sending an event: releases the pointer capture the item still
     * holds, restores the item, hides the tooltip and clears the drag state.
     */
    function abandonDrag() {
        if (!dragState) {
            return;
        }
        var itemNode = dragState.element[0];
        if (itemNode && itemNode.hasPointerCapture && itemNode.releasePointerCapture
                && itemNode.hasPointerCapture(dragState.pointerId)) {
            itemNode.releasePointerCapture(dragState.pointerId);
        }
        restoreItemPosition(dragState);
        ganttTooltip.hide();
        dragState = null;
    }

    /**
     * Abandons the current press or drag when its item is no longer in the document.
     */
    function discardDetachedDrag() {
        if (dragState && !$.contains(document.documentElement, dragState.element[0])) {
            abandonDrag();
        }
    }

    /**
     * Returns whether a pointer event belongs to the pointer of the current press or drag, after discarding a press or
     * drag whose item is no longer in the document.
     *
     * @param oe native pointer event
     * @returns true when a press or drag is in progress and the event carries its pointer id
     */
    function isTrackedPointer(oe) {
        discardDetachedDrag();
        return dragState !== null && oe.pointerId === dragState.pointerId;
    }

    /**
     * Returns whether a value is a finite number.
     *
     * @param value value to check
     * @returns true when the value is of type number and neither NaN nor infinite
     */
    function isFiniteNumber(value) {
        return typeof value === "number" && isFinite(value);
    }

    /**
     * Returns whether a pointer event carries an integral pointer id within the 32-bit signed integer range and finite
     * clientX and clientY coordinates.
     *
     * @param oe native pointer event
     * @returns true when the pointer id is such an integer and both coordinates are finite numbers
     */
    function isValidPointerInput(oe) {
        return isFiniteNumber(oe.pointerId) && oe.pointerId % 1 === 0 && oe.pointerId >= -2147483648
            && oe.pointerId <= 2147483647 && isFiniteNumber(oe.clientX) && isFiniteNumber(oe.clientY);
    }

    /**
     * Returns whether a click on an item is ignored: true, ending the click suppression, when the click lands on the
     * dragged item before the suppression expires. An expired suppression ends at any item click; a click on another
     * item leaves an unexpired suppression in place.
     *
     * @param itemNode DOM element of the clicked item
     * @returns true when the click is ignored
     */
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

QCD.components.elements.GanttChartTooltip = function (_element) {

    var element = _element;

    var visible = false;

    var htmlElements = {};

    // liveRegions: live regions of the chart element keyed by role, "status" and "alert", or null while live feedback is
    // not enabled. measuredSize: tooltip size measured by moveTo, with width, height and bodyNode, the first node of the
    // tooltip body when measured, or null before the first measurement.
    var liveRegions = null,
        measuredSize = null;

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

    /**
     * Appends to the chart element an empty, visually hidden and atomic live region that the pointer never hits.
     *
     * @param role ARIA role of the region
     * @param politeness aria-live value of the region
     * @returns the region element
     */
    function createLiveRegion(role, politeness) {
        var region = $("<div>").addClass("ganttChartLiveRegion");
        region.attr({
            "role": role,
            "aria-live": politeness,
            "aria-atomic": "true"
        });
        region.css({
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
        });
        element.append(region);
        return region;
    }

    /**
     * Enables live feedback: appends to the chart element a polite status region and an assertive alert region, which
     * setBody fills when asked to. Later calls change nothing.
     */
    this.enableLiveFeedback = function () {
        if (liveRegions) {
            return;
        }
        liveRegions = {
            status: createLiveRegion("status", "polite"),
            alert: createLiveRegion("alert", "assertive")
        };
    };

    /**
     * Replaces the tooltip body, whether the tooltip is visible or hidden. With live feedback enabled and a liveRole of
     * "status" or "alert", the content of that live region is also replaced by a new element holding the text of the new
     * body: its trimmed, non-empty text nodes in document order, joined by single spaces.
     *
     * Example: setBody("<div>L2</div><div><div>Start</div><div>2026-06-01 10:00:00</div></div>", "status") puts
     * "L2 Start 2026-06-01 10:00:00" in the status region.
     *
     * @param body HTML of the new body
     * @param liveRole optional role of the live region that announces the new body, "status" or "alert"; any other value,
     *                 or a tooltip without live feedback, leaves the live regions unchanged
     */
    this.setBody = function (body, liveRole) {
        htmlElements.tooltipBodyWrapper.html(body);
        if (liveRegions && Object.prototype.hasOwnProperty.call(liveRegions, liveRole)) {
            liveRegions[liveRole].empty().append($("<div>").text(getBodyText()));
        }
    };

    /**
     * Moves the visible tooltip to the position show would give it for a pointer position, without writing its body. The
     * tooltip is measured on the first call and again after its body content has been replaced, by setBody or by show;
     * other calls reuse that measurement. A hidden tooltip is left unchanged.
     *
     * @param x horizontal viewport position of the pointer
     * @param y vertical viewport position of the pointer
     * @returns true when the tooltip is visible and has been moved, false when it is hidden
     */
    this.moveTo = function (x, y) {
        if (!visible) {
            return false;
        }
        var bodyNode = htmlElements.tooltipBodyWrapper[0].firstChild,
            position;
        if (!measuredSize || measuredSize.bodyNode !== bodyNode) {
            measuredSize = {
                width: htmlElements.tooltipElement.width(),
                height: htmlElements.tooltipElement.height(),
                bodyNode: bodyNode
            };
        }
        position = calculatePosition(x, y, measuredSize);
        htmlElements.tooltipElement.css("left", position.x).css("top", position.y);
        return true;
    };

    this.show = function (x, y, body) {
        if (!visible) {
            htmlElements.tooltipBodyWrapper.html(body);
        }
        var position = calculatePosition(x, y);
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

    /**
     * Calculates the viewport position of the tooltip for a pointer position: centred below the pointer, kept inside the
     * window horizontally and placed above the pointer when it would reach the bottom of the window.
     *
     * @param x horizontal viewport position of the pointer
     * @param y vertical viewport position of the pointer
     * @param size optional tooltip size with width and height; without it the tooltip is measured
     * @returns position with x and y
     */
    function calculatePosition(x, y, size) {
        var spacing = {
            top: 20,
            right: 40,
            bottom: 20,
            left: 20
        };

        var windowWidth = $(window).width();
        var windowHeight = $(window).height();

        var tooltipWidth = size ? size.width : htmlElements.tooltipElement.width();
        var tooltipHeight = size ? size.height : htmlElements.tooltipElement.height();

        var calcX = x - (tooltipWidth / 2);
        var calcY = y + 20;

        if (calcX < spacing.left) {
            calcX = spacing.left;
        } else if (calcX + tooltipWidth > windowWidth - spacing.right) {
            calcX = windowWidth - tooltipWidth - spacing.right;
        }

        if (calcY + tooltipHeight > windowHeight - spacing.bottom) {
            calcY = y - tooltipHeight - 20;
        }

        return {
            x: calcX,
            y: calcY
        }
    }

    /**
     * Returns the text of the tooltip body.
     *
     * @returns the trimmed, non-empty text nodes of the body in document order, joined by single spaces
     */
    function getBodyText() {
        var parts = [];
        collectTextNodes(htmlElements.tooltipBodyWrapper[0], parts);
        return parts.join(" ");
    }

    /**
     * Appends the trimmed, non-empty text of every text node below a node to a list, in document order.
     *
     * @param node DOM node whose descendants are read
     * @param parts list receiving the texts
     */
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
