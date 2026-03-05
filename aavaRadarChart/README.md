# Aava Radar Chart for Power BI

A radar char for Power BI. Built with Aava look, non-productized. 

## Prerequisites 

Install node.js and pbiviz as per https://learn.microsoft.com/en-us/power-bi/developer/visuals/environment-setup?tabs=desktop

## Data

The visual accepts a table with two columns: category and value. Category values become axes, corresponding values values.

Max values are currently hard-coded at 5. 

The center label is the average of values, divided by max values and multiplied by 100. 

## Usage

To package the visual, run `npx pbiviz package`. 
The package is created in folder dist; add that to Power BI Desktop at Visualizations -> Import a visual from a file.

## License

This visual is published under MIT License. See https://opensource.org/license/mit 
