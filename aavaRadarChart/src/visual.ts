"use strict"

import "./../style/visual.less"
import powerbi from "powerbi-visuals-api"
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import ISelectionManager = powerbi.extensibility.ISelectionManager
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel"
import IVisualEventService = powerbi.extensibility.IVisualEventService
import { AavaRadarChartSettingsModel } from "./settings"
import * as d3 from "d3"
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>
type DataPoint = {
    value: number,
    label: string,
    selectionId: powerbi.visuals.ISelectionId,
    highlight?: boolean
}

const MAX_VALUE: number = 5
const COLOR_BLUE = "#004D7D"

const DEBUG = false

const debug = (msg: string, obj?: any) => {
    if (DEBUG) { console.log(msg, obj) }
}

export class Visual implements IVisual {
    private svg: Selection<SVGElement>
    private container: Selection<SVGElement>
    private circleBullseye: Selection<SVGElement>
    private circle1: Selection<SVGElement>
    private circle2: Selection<SVGElement>
    private circle3: Selection<SVGElement>
    private circle4: Selection<SVGElement>
    private circle5: Selection<SVGElement>
    private textLabel: Selection<SVGElement>
    private dataContainer: Selection<SVGElement>
    private formattingSettings: AavaRadarChartSettingsModel
    private formattingSettingsService: FormattingSettingsService
    private events: IVisualEventService
    private selectionManager: ISelectionManager
    private host: powerbi.extensibility.visual.IVisualHost

    private width: number
    private height: number
    private radius: number
    private fontSizeValue: number

    private dataPoints: Array<DataPoint>
    private selectedDataPoints: Array<DataPoint>

    constructor(options: VisualConstructorOptions) {
        this.host = options.host
        this.formattingSettingsService = new FormattingSettingsService()
        this.events = options.host.eventService
        this.selectionManager = options.host.createSelectionManager()

        this.svg = d3.select(options.element)
            .append('svg')
        this.handleContextMenu()
        this.container = this.svg.append("g")
        this.circle5 = this.container.append("circle")
        this.circle4 = this.container.append("circle")
        this.circle3 = this.container.append("circle")
        this.circle2 = this.container.append("circle")
        this.circle1 = this.container.append("circle")
        this.dataContainer = this.svg.append("g")

        this.selectedDataPoints = []
    }

    private handleContextMenu() {
        this.svg.on("contextmenu", (event, dataPoint) => {
            const mouseEvent: MouseEvent = event
            this.selectionManager.showContextMenu(dataPoint ? dataPoint : {}, {
                x: mouseEvent.clientX,
                y: mouseEvent.clientY
            })
            mouseEvent.preventDefault()
        })
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings)
    }

    private updateCircle(circle: Selection<SVGElement>, fill: string, stroke: string, radiusFraction: number) {
        circle
            .style("fill", fill)
            .style("stroke", stroke)
            .style("stroke-width", 2)
            .attr("r", radiusFraction * this.radius)
            .attr("cx", this.width / 2)
            .attr("cy", this.height / 2)
    }

    private getPoint(radius: number, angle: number): { x: number, y: number } {
        return {
            x: this.width / 2 + radius * Math.cos(angle),
            y: this.height / 2 + (radius * Math.sin(angle))
        }
    }

    private getDataPolygonPoint(value: number, dataCount: number, dataCurrent: number): string {
        const angle = 2 * Math.PI * dataCurrent / dataCount
        const dataPoint = this.getPoint(value / MAX_VALUE * this.radius, angle)
        return "" + dataPoint.x + "," + dataPoint.y
    }

    private splitToMinLength(text: string, maxLength: number = 14, minLength: number = 5): string[] {
        const words = text.split(/\s+/)
        const result: string[] = []
        let current = ""

        for (const word of words) {
            const test = current ? `${current} ${word}` : word
            if (test.length >= maxLength && current && current.length > minLength) {
                result.push(current)
                current = word
            } else {
                current = test
            }
        }
        if (current) result.push(current)
        return result
    }

    private isDataPointSelected(dataPoint: DataPoint): boolean {
        debug("isDataPointSelected", { dataPoint, selectedDataPoints: this.selectedDataPoints })

        for (const i in this.selectedDataPoints) {
            if (this.selectedDataPoints[i].selectionId.getKey() === dataPoint.selectionId.getKey()) { return true }
        }
        return false
    }

    private addDataPoint(dataPoint: DataPoint, dataCount: number, dataCurrent: number, isHighlighting: boolean) {
        debug('addDataPoint', { point: dataPoint, dataCount, dataCurrent })

        const angle = 2 * Math.PI * dataCurrent / dataCount
        let isOverMaxValue = false

        if (dataPoint.value > MAX_VALUE) {
            isOverMaxValue = true
        }

        const valueText = "" + (Math.round(dataPoint.value * 10) / 10).toString() + (isOverMaxValue ? "⚠️" : "")

        const lineEndPoint = this.getPoint(this.radius, angle)
        this.dataContainer.append("line")
            .style("stroke", "white")
            .attr("x1", this.width / 2)
            .attr("y1", this.height / 2)
            .attr("x2", lineEndPoint.x)
            .attr("y2", lineEndPoint.y)
            .style("stroke-width", 2)

        const geomPoint = this.getPoint(dataPoint.value / MAX_VALUE * this.radius, angle)
        this.dataContainer.append("circle")
            .datum(dataPoint)
            .classed("radarPoint", true)
            .attr("cx", geomPoint.x)
            .attr("cy", geomPoint.y)
            .attr("r", this.fontSizeValue / 8)
            .style("fill", COLOR_BLUE)
            .style("fill-opacity", (
                (isHighlighting && !dataPoint.highlight) || (this.hasSelections() && !this.isDataPointSelected(dataPoint))
            ) ? 0.5 : 1)


        this.dataContainer.append("text")
            .datum(dataPoint)
            .classed("radarPoint", true)
            .text(valueText)
            .attr("x", geomPoint.x)
            .attr("y", geomPoint.y)
            .attr("text-anchor", "middle")
            .attr("dy", "+0.35em")
            .style("font-size", this.fontSizeValue / 8 + "px")
            .style("fill", "white")
            .style("font-weight", "bold")

        const axisLabelPoint = this.getPoint(1.12 * this.radius, angle)
        const vDistanceFromMiddle = axisLabelPoint.x - this.width / 2

        let textAnchor = "middle"
        if (vDistanceFromMiddle > 0.5 * this.radius) {
            textAnchor = "start"
        } else if (vDistanceFromMiddle < -0.5 * this.radius) {
            textAnchor = "end"
        }

        const axisLabelRows = textAnchor == "middle" ? [dataPoint.label] : this.splitToMinLength(dataPoint.label)
        const axisLabelDy = textAnchor !== "middle" && axisLabelPoint.y < this.height / 2 ? (axisLabelRows.length - 1) * this.fontSizeValue / 8 : 0

        const axisLabelElement = this.dataContainer.append("text")
            .attr("x", axisLabelPoint.x)
            .attr("y", axisLabelPoint.y - axisLabelDy + this.fontSizeValue / 14)
            .attr("text-anchor", textAnchor)
            .style("font-size", this.fontSizeValue / 8 + "px")


        axisLabelRows.forEach((axisLabelRow, index) => {
            axisLabelElement.append("tspan")
                .datum(dataPoint)
                .classed("radarPoint", true)
                .text(axisLabelRow)
                .attr("x", axisLabelPoint.x)
                .attr("dy", "" + (index > 0 ? 1.5 : 0) + "em")
        })
    }

    private getDataPoints(dataViews: powerbi.DataView[]): DataPoint[] {
        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.values
        ) {
            return []
        }

        const categorical = dataViews[0].categorical
        const categoryColumn = categorical.categories[0]

        const valuesColumn = categorical.values[0]
        const values = valuesColumn.values as number[]
        const highlights = valuesColumn.highlights as (number | null)[] | undefined

        debug('categorical', { categorical, values, highlights })

        return values.map((value, index) => {
            const valueNum = value as number

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(categoryColumn, index)
                .createSelectionId()

            const highlight = !!(highlights && highlights[index])

            return {
                label: categoryColumn.values[index] as string,
                value: valueNum > MAX_VALUE ? MAX_VALUE + 0.01 : valueNum,
                selectionId,
                highlight
            }

        })
    }

    private getScore(dataPoints: DataPoint[]): string {
        if (dataPoints.length === 0) {
            return ""
        }
        const sum = dataPoints.reduce((acc, current) => {
            return acc + current.value
        }, 0)
        const avg = sum / dataPoints.length
        return Math.round(100 * (avg - 1) / (MAX_VALUE - 1)).toString()
    }

    private hasHighlights(dataPoints: Array<DataPoint>): boolean {
        for (const i in dataPoints) {
            if (dataPoints[i].highlight) { return true }
        }
        return false
    }

    private hasSelections(): boolean {
        return this.selectedDataPoints.length > 0
    }

    private render() {
        this.updateCircle(this.circle5, "#D4EBD4", "#3FA44E66", 5 / MAX_VALUE)
        this.updateCircle(this.circle4, "#FFF3C7", "#3FA44E66", 4 / MAX_VALUE)
        this.updateCircle(this.circle3, "#FFC6C6", "#DF073333", 3 / MAX_VALUE)
        this.updateCircle(this.circle2, "#FFC6C6", "#DF073333", 2 / MAX_VALUE)
        this.updateCircle(this.circle1, "#FFC6C6", "#DF073333", 1 / MAX_VALUE)

        this.dataContainer.selectAll("*").remove()

        const plotPoints = this.dataPoints.reduce((acc, current, i) => {
            acc.push(this.getDataPolygonPoint(current.value, this.dataPoints.length, i))
            return acc
        }, [])

        this.dataContainer.append("polygon")
            .style("fill", "#009BDF26")
            .style("stroke-width", 3)
            .style("stroke", COLOR_BLUE)
            .attr("points", plotPoints.join(" "))

        this.dataPoints.forEach((point, i) => {
            this.addDataPoint(point, this.dataPoints.length, i, this.hasHighlights(this.dataPoints))
        })

        this.svg.on("click", () => {
            debug("background svg clicked")
            this.selectionManager.clear()
            this.selectedDataPoints = []
            this.render()
        })

        this.svg.selectAll(".radarPoint")
            .on("click", (event: MouseEvent, dataPoint: DataPoint) => {
                debug("category clicked", { dataPoint, event })
                const isMulti = event.ctrlKey || event.metaKey
                this.selectionManager.select(dataPoint.selectionId, isMulti)

                const isAlreadySelected = this.isDataPointSelected(dataPoint)
                const isMultipleSelected = this.selectedDataPoints.length > 1


                if (!isMulti) {
                    if (isAlreadySelected && isMultipleSelected) {
                        // Case: the user clicked a selected item while other items are selected
                        // Action: keep only this item selected (becomes single selection)
                        this.selectedDataPoints = [dataPoint]
                    }
                    else if (isAlreadySelected && !isMultipleSelected) {
                        // Case: user clicked the already-selected item when it is the ONLY selection
                        // Action: clear selection (toggle off)
                        this.selectedDataPoints = []
                    }
                    else {
                        // Case: clicked a new item
                        // Action: select only this item
                        this.selectedDataPoints = [dataPoint]
                    }
                }
                else {
                    if (!isAlreadySelected) {
                        // Case: CTRL+click on unselected item → add it
                        this.selectedDataPoints.push(dataPoint)
                    }
                    else {
                        // Case: CTRL+click on a selected item → remove it
                        // Edge case: after removal, if empty → no selection
                        this.selectedDataPoints = this.selectedDataPoints.filter(dp => dp.selectionId.getKey() !== dataPoint.selectionId.getKey())
                    }
                }

                this.render()
                event.stopPropagation()
            })


        this.circleBullseye = this.dataContainer.append("circle")
        this.updateCircle(this.circleBullseye, COLOR_BLUE, COLOR_BLUE, 0.6 / MAX_VALUE)
        this.textLabel = this.dataContainer.append("text")
        this.textLabel
            .text(this.getScore(this.dataPoints))
            .attr("x", this.width / 2)
            .attr("y", this.height / 2)
            .attr("dy", "+0.35em")
            .attr("text-anchor", "middle")
            .style("fill", "white")
            .style("font-weight", "bold")
            .style("font-size", this.fontSizeValue / 3.75 + "px")

    }

    public update(options: VisualUpdateOptions) {
        try {
            this.events.renderingStarted(options)

            this.width = options.viewport.width
            this.height = options.viewport.height
            this.svg.attr("width", this.width)
            this.svg.attr("height", this.height)
            this.radius = this.width < 1.5 * this.height ? this.width / (1.5 * 2.35) : this.height / 2.35
            this.fontSizeValue = Math.min(this.width, this.height) / 5

            this.dataPoints = this.getDataPoints(options.dataViews)

            this.render()

            this.events.renderingFinished(options)
        } catch (e) {
            debug("error in update", e)
            this.events.renderingFailed(options, e)
        }
    }
}
