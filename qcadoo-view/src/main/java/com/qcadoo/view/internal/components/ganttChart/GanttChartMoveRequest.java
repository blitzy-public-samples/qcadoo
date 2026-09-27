/**
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
package com.qcadoo.view.internal.components.ganttChart;

import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

import com.qcadoo.view.api.components.ganttChart.GanttChartItem;

/**
 * Describes one validated drop of a Gantt item, handed to moveItem listeners. The request holds a copy of the Gantt chart
 * component context that is within the bounds of {@link #isWithinContextBounds(JSONObject)}.
 */
public final class GanttChartMoveRequest {

    /**
     * Deepest nesting level of a context a request copies: the context object is level 1, an object or array value in it is
     * level 2, and an object or array value in one of those is level 3.
     */
    public static final int CONTEXT_MAX_DEPTH = 3;

    /** Most values of a context a request copies: object members plus array elements, counted over all levels. */
    public static final int CONTEXT_MAX_VALUES = 64;

    /** Most characters of a context a request copies: member names plus string values, counted over all levels. */
    public static final int CONTEXT_MAX_TEXT_LENGTH = 16384;

    private final GanttChartItem item;

    private final String targetRowName;

    private final String originalRowName;

    private final String originalName;

    private final String originalDateFrom;

    private final String originalDateTo;

    private final Date dateFrom;

    private final Date dateTo;

    private final JSONObject context;

    /**
     * Creates the description of one drop.
     *
     * @param item
     *            the dropped item, carrying the new dates and positions
     * @param targetRowName
     *            name of the row the item was dropped on
     * @param originalRowName
     *            row name of the item as rendered on the client
     * @param originalName
     *            name of the item as rendered on the client
     * @param originalDateFrom
     *            start of the item as rendered on the client, in the yyyy-MM-dd HH:mm:ss format
     * @param originalDateTo
     *            end of the item as rendered on the client, in the yyyy-MM-dd HH:mm:ss format
     * @param dateFrom
     *            new start of the item, must not be null
     * @param dateTo
     *            new end of the item, must not be null
     * @param context
     *            context of the Gantt chart component, may be null; the request keeps a copy taken here, and later changes of
     *            the given object do not reach the request
     * @throws IllegalArgumentException
     *             when the context is not within the bounds of {@link #isWithinContextBounds(JSONObject)}; the context is
     *             checked before any other argument is read
     */
    public GanttChartMoveRequest(final GanttChartItem item, final String targetRowName, final String originalRowName,
            final String originalName, final String originalDateFrom, final String originalDateTo, final Date dateFrom,
            final Date dateTo, final JSONObject context) {
        JSONObject contextCopy = copyWithinBounds(context);
        if (contextCopy == null) {
            throw new IllegalArgumentException("The Gantt chart component context is not within the bounds of a move request");
        }
        this.item = item;
        this.targetRowName = targetRowName;
        this.originalRowName = originalRowName;
        this.originalName = originalName;
        this.originalDateFrom = originalDateFrom;
        this.originalDateTo = originalDateTo;
        this.dateFrom = new Date(dateFrom.getTime());
        this.dateTo = new Date(dateTo.getTime());
        this.context = contextCopy;
    }

    /**
     * Checks whether a Gantt chart component context is within the bounds a move request copies:
     * <ul>
     * <li>at most {@link #CONTEXT_MAX_DEPTH} levels, the context object being level 1;</li>
     * <li>at most {@link #CONTEXT_MAX_VALUES} object members and array elements over all levels;</li>
     * <li>at most {@link #CONTEXT_MAX_TEXT_LENGTH} characters of member names and string values over all levels;</li>
     * <li>member names that are {@link String}s, and values that are {@link String}, {@link Boolean}, {@link Integer},
     * {@link Long}, {@link Double}, {@link JSONObject#NULL}, {@link JSONObject} or {@link JSONArray}.</li>
     * </ul>
     * The check stops at the first level, value, character or type beyond these bounds. The length of each object and array
     * is compared with the values left before its content is read, and every member and element read spends one value.
     *
     * @param context
     *            context to check, may be null
     * @return true when the context is null or within the bounds
     */
    public static boolean isWithinContextBounds(final JSONObject context) {
        return context == null || new BoundedContextCopier().copyObject(context, 1) != null;
    }

    /**
     * Returns the dropped item, carrying the new dates and positions.
     *
     * @return dropped item
     */
    public GanttChartItem getItem() {
        return item;
    }

    /**
     * Returns the entity id of the dropped item.
     *
     * @return entity id of the dropped item
     */
    public Long getItemId() {
        return item.getEntityId();
    }

    /**
     * Returns the name of the row the item was dropped on.
     *
     * @return target row name
     */
    public String getTargetRowName() {
        return targetRowName;
    }

    /**
     * Returns the row name of the item as rendered on the client.
     *
     * @return original row name
     */
    public String getOriginalRowName() {
        return originalRowName;
    }

    /**
     * Returns the name of the item as rendered on the client.
     *
     * @return original item name
     */
    public String getOriginalName() {
        return originalName;
    }

    /**
     * Returns the start of the item as rendered on the client, in the yyyy-MM-dd HH:mm:ss format.
     *
     * @return original start
     */
    public String getOriginalDateFrom() {
        return originalDateFrom;
    }

    /**
     * Returns the end of the item as rendered on the client, in the yyyy-MM-dd HH:mm:ss format.
     *
     * @return original end
     */
    public String getOriginalDateTo() {
        return originalDateTo;
    }

    /**
     * Returns a copy of the new start of the item.
     *
     * @return new start
     */
    public Date getDateFrom() {
        return new Date(dateFrom.getTime());
    }

    /**
     * Returns a copy of the new end of the item.
     *
     * @return new end
     */
    public Date getDateTo() {
        return new Date(dateTo.getTime());
    }

    /**
     * Returns a new copy of the Gantt chart component context as it was when the request was created, or an empty object when
     * no context was given. Every call returns a new object whose nested objects and arrays are new objects as well.
     *
     * @return copy of the component context
     */
    public JSONObject getContext() {
        return copyWithinBounds(context);
    }

    /**
     * Copies a context through {@link BoundedContextCopier}.
     *
     * @param source
     *            context to copy, may be null
     * @return a new object with the content of the source, an empty object when the source is null, or null when the source
     *         is not within the bounds of {@link #isWithinContextBounds(JSONObject)}
     */
    private static JSONObject copyWithinBounds(final JSONObject source) {
        if (source == null) {
            return new JSONObject();
        }
        return new BoundedContextCopier().copyObject(source, 1);
    }

    /**
     * Copies one context level by level within {@link GanttChartMoveRequest#CONTEXT_MAX_DEPTH},
     * {@link GanttChartMoveRequest#CONTEXT_MAX_VALUES} and {@link GanttChartMoveRequest#CONTEXT_MAX_TEXT_LENGTH}. Each object
     * and array of the copy is a new {@link JSONObject} or {@link JSONArray}; string, boolean, number and
     * {@link JSONObject#NULL} values are shared with the source. Each instance copies one context: every member and element
     * spends one value of its budget, and every member name and string value spends its length of its text budget.
     */
    private static final class BoundedContextCopier {

        private int remainingValues = CONTEXT_MAX_VALUES;

        private int remainingTextLength = CONTEXT_MAX_TEXT_LENGTH;

        /**
         * Copies an object found at the given level.
         *
         * @param source
         *            object to copy
         * @param depth
         *            level of the object, 1 for the context itself
         * @return the copy, or null when the level, the object's length or any of its members is beyond the bounds
         */
        JSONObject copyObject(final JSONObject source, final int depth) {
            if (depth > CONTEXT_MAX_DEPTH || source.length() > remainingValues) {
                return null;
            }
            Map<String, Object> members = new HashMap<String, Object>();
            Iterator<?> names = source.keys();
            while (names.hasNext()) {
                Object name = names.next();
                if (!spendValue() || !(name instanceof String) || !spendText((String) name)) {
                    return null;
                }
                Object value = copyValue(source.opt((String) name), depth);
                if (value == null) {
                    return null;
                }
                members.put((String) name, value);
            }
            return new JSONObject(members);
        }

        /**
         * Copies an array found at the given level.
         *
         * @param source
         *            array to copy
         * @param depth
         *            level of the array
         * @return the copy, or null when the level, the array's length or any of its elements is beyond the bounds
         */
        private JSONArray copyArray(final JSONArray source, final int depth) {
            int length = source.length();
            if (depth > CONTEXT_MAX_DEPTH || length > remainingValues) {
                return null;
            }
            JSONArray elements = new JSONArray();
            for (int index = 0; index < length; index++) {
                if (!spendValue()) {
                    return null;
                }
                Object value = copyValue(source.opt(index), depth);
                if (value == null) {
                    return null;
                }
                elements.put(value);
            }
            return elements;
        }

        /**
         * Copies a member or element value of an object or array found at the given level.
         *
         * @param value
         *            value to copy, may be null
         * @param depth
         *            level of the object or array holding the value
         * @return a new copy of an object or array value, the value itself for a string within the text left and for a
         *         boolean, {@link Integer}, {@link Long}, {@link Double} or {@link JSONObject#NULL}, or null for any other
         *         value and for a value beyond the bounds
         */
        private Object copyValue(final Object value, final int depth) {
            if (value instanceof JSONObject) {
                return copyObject((JSONObject) value, depth + 1);
            }
            if (value instanceof JSONArray) {
                return copyArray((JSONArray) value, depth + 1);
            }
            if (value instanceof String) {
                return spendText((String) value) ? value : null;
            }
            if (value instanceof Boolean || value instanceof Integer || value instanceof Long || value instanceof Double
                    || value == JSONObject.NULL) {
                return value;
            }
            return null;
        }

        /**
         * Spends one value of the value budget.
         *
         * @return false, spending nothing, when no value is left
         */
        private boolean spendValue() {
            if (remainingValues == 0) {
                return false;
            }
            remainingValues--;
            return true;
        }

        /**
         * Spends the length of a text of the text budget.
         *
         * @param text
         *            member name or string value
         * @return false, spending nothing, when the text is longer than the characters left
         */
        private boolean spendText(final String text) {
            if (text.length() > remainingTextLength) {
                return false;
            }
            remainingTextLength -= text.length();
            return true;
        }

    }
}
