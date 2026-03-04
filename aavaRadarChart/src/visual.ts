"use strict"

import "./../style/visual.less"
import powerbi from "powerbi-visuals-api"
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import {AavaRadarChartSettingsModel} from "./settings"
import * as d3 from "d3"
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>
type DataPointType = { value: number, label: string }

const MAX_VALUE: number = 5
const COLOR_BLUE = "#004D7D"

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

    private width: number
    private height: number
    private radius: number
    private fontSizeValue: number

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService()
        this.events = options.host.eventService

        this.svg = d3.select(options.element)
            .append('svg')
        this.container = this.svg.append("g")
        this.circle5 = this.container.append("circle")
        this.circle4 = this.container.append("circle")
        this.circle3 = this.container.append("circle")
        this.circle2 = this.container.append("circle")
        this.circle1 = this.container.append("circle")
        this.dataContainer = this.svg.append("g")
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
    
    private addDataPoint(value: number, label: string, dataCount: number, dataCurrent: number) {
        const angle = 2 * Math.PI * dataCurrent / dataCount
        let isOverMaxValue = false

        if (value > MAX_VALUE) {
            isOverMaxValue = true
        }

        const valueText = "" + (Math.round(value * 10) / 10).toString() + (isOverMaxValue ? "⚠️": "")

        const lineEndPoint = this.getPoint(this.radius, angle)
        this.dataContainer.append("line")
            .style("stroke", "white")
            .attr("x1", this.width / 2)
            .attr("y1", this.height / 2)
            .attr("x2", lineEndPoint.x)
            .attr("y2", lineEndPoint.y)
            .style("stroke-width", 2)

        const dataPoint = this.getPoint(value / MAX_VALUE * this.radius, angle)
        this.dataContainer.append("circle")
            .attr("cx", dataPoint.x)
            .attr("cy", dataPoint.y)
            .attr("r", this.fontSizeValue / 8)
            .style("fill", COLOR_BLUE)
        this.dataContainer.append("text")
            .text(valueText)
            .attr("x", dataPoint.x)
            .attr("y", dataPoint.y)
            .attr("text-anchor", "middle")
            .attr("dy", "+0.35em")
            .style("font-size", this.fontSizeValue / 8 + "px")
            .style("fill", "white")
            .style("font-weight", "bold")

        const axisLabelPoint = this.getPoint(1.12 * this.radius, angle)
        const vDistanceFromMiddle = axisLabelPoint.x - this.width/2

        let textAnchor = "middle"
        if (vDistanceFromMiddle > 0.5 * this.radius) {
            textAnchor = "start"
        } else if (vDistanceFromMiddle < -0.5 * this.radius) {
            textAnchor = "end"
        }

        const axisLabelRows = textAnchor == "middle"? [label] : this.splitToMinLength(label)
        const axisLabelDy = textAnchor !== "middle" && axisLabelPoint.y < this.height/2? (axisLabelRows.length - 1) * this.fontSizeValue / 8 : 0

        const axisLabelElement = this.dataContainer.append("text")
            .attr("x", axisLabelPoint.x)
            .attr("y", axisLabelPoint.y -  axisLabelDy + this.fontSizeValue / 14)
            .attr("text-anchor", textAnchor)
            .style("font-size", this.fontSizeValue / 8 + "px")

        axisLabelRows.forEach((axisLabelRow, index) => {
            axisLabelElement.append("tspan")
                .text(axisLabelRow)
                .attr("x", axisLabelPoint.x)
                .attr("dy", "" + (index > 0? 1.5 : 0) +"em")
        })
    }

    private getDataPoints(dataViews: powerbi.DataView[]): DataPointType[] {
        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].table
            || !dataViews[0].table.rows
        ) {
            return []
        }

        return dataViews[0].table.rows.reduce<Array<DataPointType>>((acc, row) => {
            if (row[0] && row[1]) {
                const value = row[1] as number

                acc.push({
                    label: row[0] as string,
                    value: value > MAX_VALUE? MAX_VALUE + 0.01 : value
                })
            }
            return acc
        }, [])
    }

    private getScore(dataPoints: DataPointType[]): string{
        if (dataPoints.length === 0) {
            return ""
        }
        const sum = dataPoints.reduce((acc, current) => {
            return acc + current.value
        }, 0)
        const avg = sum/dataPoints.length
        return Math.round(100 * (avg - 1) / (MAX_VALUE - 1)).toString()
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options)

        this.width = options.viewport.width
        this.height = options.viewport.height
        this.svg.attr("width", this.width)
        this.svg.attr("height", this.height)
        this.radius = this.width < 1.5 * this.height? this.width / (1.5 * 2.35) : this.height / 2.35
        this.fontSizeValue = Math.min(this.width, this.height) / 5

        this.updateCircle(this.circle5, "#D4EBD4", "#3FA44E66", 5 / MAX_VALUE)
        this.updateCircle(this.circle4, "#FFF3C7", "#3FA44E66", 4 / MAX_VALUE)
        this.updateCircle(this.circle3, "#FFC6C6", "#DF073333", 3 / MAX_VALUE)
        this.updateCircle(this.circle2, "#FFC6C6", "#DF073333", 2 / MAX_VALUE)
        this.updateCircle(this.circle1, "#FFC6C6", "#DF073333", 1 / MAX_VALUE)

        const dataPoints = this.getDataPoints(options.dataViews)

        this.dataContainer.selectAll("*").remove()

        const plotPoints = dataPoints.reduce((acc, current, i) => {
            acc.push(this.getDataPolygonPoint(current.value, dataPoints.length, i))
            return acc
        }, [])

        this.dataContainer.append("polygon")
            .style("fill", "#009BDF26")
            .style("stroke-width", 3)
            .style("stroke", COLOR_BLUE)
            .attr("points", plotPoints.join(" "))

        dataPoints.reduce((acc, current, i) => {
            acc.push(this.addDataPoint(current.value, current.label, dataPoints.length, i))
            return acc
        }, [])
    
        this.circleBullseye = this.dataContainer.append("circle")
        this.updateCircle(this.circleBullseye, COLOR_BLUE, COLOR_BLUE, 0.6 / MAX_VALUE)
        this.textLabel = this.dataContainer.append("text")
        this.textLabel
            .text(this.getScore(dataPoints))
            .attr("x", this.width / 2)
            .attr("y", this.height / 2)
            .attr("dy", "+0.35em")
            .attr("text-anchor", "middle")
            .style("fill", "white")
            .style("font-weight", "bold")
            .style("font-size", this.fontSizeValue / 3.75 + "px")

        this.events.renderingFinished(options)
    }    
}
