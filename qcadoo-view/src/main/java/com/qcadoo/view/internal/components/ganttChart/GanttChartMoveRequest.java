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

import org.json.JSONException;
import org.json.JSONObject;

import com.qcadoo.view.api.components.ganttChart.GanttChartItem;

/**
 * Describes one validated drop of a Gantt item, handed to moveItem listeners.
 */
public final class GanttChartMoveRequest {

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
     * @throws IllegalStateException
     *             when the context cannot be written as JSON and read back
     */
    public GanttChartMoveRequest(final GanttChartItem item, final String targetRowName, final String originalRowName,
            final String originalName, final String originalDateFrom, final String originalDateTo, final Date dateFrom,
            final Date dateTo, final JSONObject context) {
        this.item = item;
        this.targetRowName = targetRowName;
        this.originalRowName = originalRowName;
        this.originalName = originalName;
        this.originalDateFrom = originalDateFrom;
        this.originalDateTo = originalDateTo;
        this.dateFrom = new Date(dateFrom.getTime());
        this.dateTo = new Date(dateTo.getTime());
        this.context = copyOf(context);
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
     * no context was given. Every call returns a new object.
     *
     * @return copy of the component context
     */
    public JSONObject getContext() {
        return copyOf(context);
    }

    /**
     * Copies a JSON object, nested objects and arrays included, by writing it as JSON text and parsing that text.
     *
     * @param source
     *            object to copy, may be null
     * @return a new object with the content of the source, or an empty object when the source is null
     * @throws IllegalStateException
     *             when the source cannot be written as JSON text, or its text cannot be parsed
     */
    private static JSONObject copyOf(final JSONObject source) {
        if (source == null) {
            return new JSONObject();
        }
        String text = source.toString();
        if (text == null) {
            throw new IllegalStateException("The Gantt chart component context cannot be written as JSON text");
        }
        try {
            return new JSONObject(text);
        } catch (JSONException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }
}
