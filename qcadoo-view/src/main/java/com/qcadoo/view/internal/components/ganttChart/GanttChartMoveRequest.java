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
     *            context of the Gantt chart component, may be null
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
        this.context = context;
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
     * Returns a copy of the Gantt chart component context, or an empty object when no context was given.
     *
     * @return copy of the component context
     */
    public JSONObject getContext() {
        if (context == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(context.toString());
        } catch (JSONException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }
}
